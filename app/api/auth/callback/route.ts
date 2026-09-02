import { NextResponse } from "next/server";
import { ensureDefaultProfileRow } from "@/app/lib/database/profiles-row";
import { upsertPublicUserFromAuth } from "@/app/lib/database/users-row";
import { createClient } from "@/app/lib/supabase/server";

function safeNextPath(raw: string | null) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { error: dbError } = await upsertPublicUserFromAuth(
          supabase,
          user,
        );
        if (dbError) {
          console.error(
            "[auth/callback] public.users upsert failed (did you run supabase/migrations SQL in the dashboard?) —",
            dbError.message,
          );
        } else {
          const { error: profileError } = await ensureDefaultProfileRow(
            supabase,
            user.id,
          );
          if (profileError) {
            console.error(
              "[auth/callback] public.profiles insert failed —",
              profileError.message,
            );
          }
        }
      }
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocal = process.env.NODE_ENV === "development";
      if (isLocal) {
        return NextResponse.redirect(`${origin}${next}`);
      }
      if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
