import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hasSupabaseConfig } from "@/lib/env";

const publicPrefixes = ["/login", "/access-denied", "/auth/callback"];
const assetPrefixes = ["/_next", "/favicon.ico", "/robots.txt", "/sitemap.xml"];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (
    publicPrefixes.some((prefix) => pathname.startsWith(prefix)) ||
    assetPrefixes.some((prefix) => pathname.startsWith(prefix))
  ) {
    return NextResponse.next();
  }

  if (!hasSupabaseConfig()) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("setup", "missing-supabase");
    return NextResponse.redirect(loginUrl);
  }

  let response = NextResponse.next({
    request
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"]
};
