import { Suspense } from "react";

import { AuthForm } from "../components/auth-form";

export default function SignupPage() {
  const oauth = {
    google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
    github: Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET),
  };

  return (
    <Suspense fallback={null}>
      <AuthForm mode="signup" oauth={oauth} />
    </Suspense>
  );
}
