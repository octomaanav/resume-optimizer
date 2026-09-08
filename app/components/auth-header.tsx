"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

export function AuthHeader() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <span className="h-8 w-16 animate-pulse rounded-lg bg-border" />;
  }

  if (!session?.user) {
    return (
      <Link
        href="/login"
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover"
      >
        Sign in
      </Link>
    );
  }

  const label = session.user.name || session.user.email || "Signed in";

  return (
    <div className="flex max-w-[min(100%,14rem)] items-center gap-2">
      <span className="hidden truncate text-xs text-muted sm:inline" title={label}>
        {label}
      </span>
      <button
        type="button"
        onClick={() => void signOut({ callbackUrl: "/" })}
        className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-sunken hover:text-foreground"
      >
        Sign out
      </button>
    </div>
  );
}
