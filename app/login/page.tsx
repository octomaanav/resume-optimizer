import { Suspense } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { GoogleSignInPanel } from "./google-sign-in-panel";

export default function LoginPage() {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-8 py-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-white shadow-md">
          <Sparkles size={22} />
        </span>
        <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted">
          Use your Google account to access your profile and documents.
        </p>
      </div>

      <div className="w-full">
        <Suspense
          fallback={
            <div className="flex items-center justify-center gap-2 text-sm text-muted">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              Loading...
            </div>
          }
        >
          <GoogleSignInPanel />
        </Suspense>
      </div>

      <p className="text-center text-xs text-muted">
        <Link href="/" className="underline underline-offset-2 hover:text-foreground">
          Back to home
        </Link>
      </p>
    </div>
  );
}
