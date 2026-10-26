# Build JavaScript on the builder's native architecture. The runtime and its
# production dependencies target linux/amd64 (the bundled Tectonic platform).
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN node scripts/render-warm-template.mjs
ARG NEXT_PUBLIC_CLOUD_WORKSPACES_ENABLED=false
ARG NEXT_PUBLIC_DEFAULT_STORAGE=local
ENV NEXT_PUBLIC_CLOUD_WORKSPACES_ENABLED=$NEXT_PUBLIC_CLOUD_WORKSPACES_ENABLED NEXT_PUBLIC_DEFAULT_STORAGE=$NEXT_PUBLIC_DEFAULT_STORAGE
RUN NODE_OPTIONS=--max-old-space-size=1024 npx tsc --noEmit
# Build-only placeholders: never put runtime credentials into image layers.
RUN TYPECHECK_ALREADY_PASSED=true NODE_OPTIONS=--max-old-space-size=768 DATABASE_URL=postgresql://build:build@127.0.0.1/build AUTH_SECRET=build-only-placeholder-not-a-runtime-secret npm run build

FROM node:22-trixie-slim AS runtime-dependencies
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates bubblewrap libfontconfig1 libharfbuzz0b libgraphite2-3 libicu76 libssl3t64 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 XDG_CACHE_HOME=/opt/tex-cache
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY scripts/warm-latex.mjs ./scripts/warm-latex.mjs
COPY --from=build /app/deploy/warm-template.tex ./deploy/warm-template.tex
RUN node scripts/warm-latex.mjs

FROM runtime-dependencies AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NODE_OPTIONS="--max-old-space-size=128 --max-semi-space-size=2"
COPY --from=build --chown=node:node /app/.next/standalone ./.next/standalone
# Native build-machine dependencies must never override target-platform modules.
RUN rm -rf .next/standalone/node_modules && chown -R node:node /opt/tex-cache
COPY --from=build --chown=node:node /app/.next/static ./.next/standalone/.next/static
COPY --from=build --chown=node:node /app/public ./.next/standalone/public
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node scripts ./scripts
ARG NEXT_PUBLIC_CLOUD_WORKSPACES_ENABLED=false
ENV NEXT_PUBLIC_CLOUD_WORKSPACES_ENABLED=$NEXT_PUBLIC_CLOUD_WORKSPACES_ENABLED
USER node
EXPOSE 3000
CMD ["sh", "scripts/start-container.sh"]
