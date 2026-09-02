import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <div className="mx-auto max-w-md text-center">
      <h1 className="text-xl font-semibold tracking-tight">
        Sign-in didn&apos;t finish
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        The auth link may have expired or already been used. Try signing in
        again.
      </p>
      <Link
        href="/login"
        className="mt-6 inline-flex rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        Back to sign in
      </Link>
    </div>
  );
}
