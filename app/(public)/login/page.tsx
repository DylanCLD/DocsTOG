import { redirect } from "next/navigation";
import { LoginCard } from "@/components/auth/login-card";
import { hasSupabaseConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ code?: string; error?: string; message?: string; next?: string }>;
}) {
  const { code, error, message, next } = await searchParams;
  const isConfigured = hasSupabaseConfig();

  if (code) {
    const callbackUrl = new URL("/auth/callback", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
    callbackUrl.searchParams.set("code", code);
    if (next) {
      callbackUrl.searchParams.set("next", next);
    }

    redirect(`${callbackUrl.pathname}${callbackUrl.search}`);
  }

  const errorMessage =
    error === "missing_admin_env"
      ? "La cle SUPABASE_SERVICE_ROLE_KEY manque cote serveur. Ajoute-la dans .env.local ou Vercel."
      : error
        ? `La connexion Google a echoue${message ? `: ${message}` : ". Verifie la configuration OAuth Supabase."}`
        : null;

  if (isConfigured) {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (user) {
      redirect("/dashboard");
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <LoginCard isConfigured={isConfigured} initialError={errorMessage} />
    </main>
  );
}
