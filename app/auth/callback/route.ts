import { NextResponse, type NextRequest } from "next/server";
import { ensureUserFromOAuth } from "@/lib/auth";
import { hasSupabaseAdminConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/dashboard";

  if (!code) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "missing_code");
    loginUrl.searchParams.set("message", "Code OAuth absent.");
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "oauth");
    loginUrl.searchParams.set("message", error.message);
    return NextResponse.redirect(loginUrl);
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user?.email) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/access-denied", request.url));
  }

  if (!hasSupabaseAdminConfig()) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=missing_admin_env", request.url));
  }

  const result = await ensureUserFromOAuth({
    id: user.id,
    email: user.email,
    fullName: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
    avatarUrl: user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null
  });

  if (!result.allowed) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/access-denied", request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}
