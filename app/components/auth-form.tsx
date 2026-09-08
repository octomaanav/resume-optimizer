"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { FileText, Loader2 } from "lucide-react";

type Mode = "login" | "signup";

const COPY: Record<Mode, { title: string; blurb: string; cta: string }> = {
  login: {
    title: "Welcome back",
    blurb: "Sign in to reach your profile, documents, and saved answers.",
    cta: "Sign in",
  },
  signup: {
    title: "Create your account",
    blurb: "Your profile and application answers stay in your local database.",
    cta: "Create account",
  },
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.6z" />
      <path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3A11.5 11.5 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.6 14.7a6.9 6.9 0 0 1 0-4.4v-3H1.8a11.5 11.5 0 0 0 0 10.4l3.8-3z" />
      <path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3A11.5 11.5 0 0 0 1.8 7.3l3.8 3C6.5 6.7 9 4.8 12 4.8z" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
      <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.9 10.9c.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.4-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 1.7 2.7 1.2 3.4.9.1-.7.4-1.2.7-1.5-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .4.2.7.8.6A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z" />
    </svg>
  );
}

export function AuthForm({
  mode,
  oauth,
}: {
  mode: Mode;
  oauth: { google: boolean; github: boolean };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "credentials" | "google" | "github">(
    null,
  );

  const copy = COPY[mode];
  const hasOauth = oauth.google || oauth.github;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("credentials");

    try {
      if (mode === "signup") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: name.trim() || undefined, email, password }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          setError(body?.error ?? "Could not create that account.");
          setBusy(null);
          return;
        }
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(
          mode === "login"
            ? "That email and password don't match an account."
            : "Account created, but sign-in failed. Try signing in.",
        );
        setBusy(null);
        return;
      }

      router.push(next);
      router.refresh();
    } catch {
      setError("Something went wrong. Is the database running?");
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-7 py-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-on-accent">
          <FileText size={20} />
        </span>
        <h1 className="text-3xl">{copy.title}</h1>
        <p className="text-sm text-muted">{copy.blurb}</p>
      </div>

      {hasOauth && (
        <>
          <div className="flex flex-col gap-2">
            {oauth.google && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  setBusy("google");
                  void signIn("google", { callbackUrl: next });
                }}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-raised px-4 py-2.5 text-sm font-medium transition-colors hover:border-border-hover hover:bg-surface disabled:opacity-60"
              >
                {busy === "google" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <GoogleMark />
                )}
                Continue with Google
              </button>
            )}
            {oauth.github && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  setBusy("github");
                  void signIn("github", { callbackUrl: next });
                }}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-raised px-4 py-2.5 text-sm font-medium transition-colors hover:border-border-hover hover:bg-surface disabled:opacity-60"
              >
                {busy === "github" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <GitHubMark />
                )}
                Continue with GitHub
              </button>
            )}
          </div>

          <div className="flex items-center gap-3" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            <span className="eyebrow">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        {mode === "signup" && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm"
              placeholder="Ada Lovelace"
            />
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm"
            placeholder="you@example.com"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Password</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm"
            placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
          />
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger-light px-3 py-2 text-xs text-danger"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy !== null}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {busy === "credentials" && <Loader2 size={16} className="animate-spin" />}
          {copy.cta}
        </button>
      </form>

      <p className="text-center text-xs text-muted">
        {mode === "login" ? (
          <>
            No account?{" "}
            <Link
              href="/signup"
              className="text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              Create one
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
