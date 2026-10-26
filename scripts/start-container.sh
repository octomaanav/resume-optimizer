#!/bin/sh
set -eu
: "${DATABASE_URL:?Set DATABASE_URL to the account database URL}"
: "${AUTH_SECRET:?Set a strong AUTH_SECRET}"
: "${AUTH_URL:?Set AUTH_URL to the public HTTPS origin}"
node scripts/migrate.mjs
exec node .next/standalone/server.js
