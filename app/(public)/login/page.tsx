import { redirect } from "next/navigation";
import { LoginCard } from "@/components/auth/login-card";
import { hasSupabaseConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const isConfigured = hasSupabaseConfig();
  const errorMessage =
    error === "missing_admin_env"
      ? "La clé SUPABASE_SERVICE_ROLE_KEY manque côté serveur. Ajoute-la dans .env.local ou Vercel."
      : error
        ? "La connexion Google a échoué. Vérifie la configuration OAuth Supabase."
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
