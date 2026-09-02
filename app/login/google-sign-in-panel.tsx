"use client";

import { createClient } from "@/app/lib/supabase/client";
import { isSupabaseConfigured } from "@/app/lib/supabase/public-env";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function GoogleSignInPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawNext = searchParams.get("next");
  const next =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace(next.startsWith("/") ? next : "/");
    });
  }, [next, router]);

  async function signInWithGoogle() {
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const origin = window.location.origin;
    const redirectTo = `${origin}/api/auth/callback?next=${encodeURIComponent(next)}`;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    setBusy(false);
    if (oauthError) {
      setError(oauthError.message);
    }
  }

  if (!isSupabaseConfigured()) {
    return (
      <p className="text-sm text-amber-800 dark:text-amber-200">
        Add{" "}
        <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">
          NEXT_PUBLIC_SUPABASE_URL
        </code>{" "}
        and{" "}
        <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">
          NEXT_PUBLIC_SUPABASE_ANON_KEY
        </code>{" "}
        (or{" "}
        <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">SUPABASE_URL</code>{" "}
        +{" "}
        <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">
          SUPABASE_ANON_KEY
        </code>{" "}
        in <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">app/.env</code>
        ). Restart <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">npm run dev</code>{" "}
        after changes.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-stretch gap-3">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void signInWithGoogle()}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium shadow-sm hover:bg-zinc-50 disabled:opacity-60 dark:hover:bg-zinc-800"
      >
        <GoogleMark />
        {busy ? "Redirecting…" : "Continue with Google"}
      </button>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg
      className="h-5 w-5 shrink-0"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
