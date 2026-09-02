"use client";

import { createClient } from "@/app/lib/supabase/client";
import { isSupabaseConfigured } from "@/app/lib/supabase/public-env";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

export function AuthHeader() {
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setUser(null);
      return;
    }
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data: { user: u } }) => setUser(u));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
    window.location.href = "/";
  }

  if (user === undefined) {
    return (
      <span className="h-8 w-16 animate-pulse rounded-lg bg-border" />
    );
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-zinc-100 hover:text-foreground dark:hover:bg-zinc-800"
      >
        Sign in
      </Link>
    );
  }

  const label =
    (typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : null) ||
    user.email ||
    "Signed in";

  return (
    <div className="flex max-w-[min(100%,14rem)] items-center gap-2 sm:max-w-xs">
      <span
        className="hidden truncate text-xs text-muted sm:inline"
        title={label}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={() => void signOut()}
        className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-zinc-100 hover:text-foreground dark:hover:bg-zinc-800"
      >
        Sign out
      </button>
    </div>
  );
}
