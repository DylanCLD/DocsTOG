"use client";

import { useState } from "react";
import { Chrome, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/browser";

export function LoginCard({
  isConfigured = true,
  initialError = null
}: {
  isConfigured?: boolean;
  initialError?: string | null;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  const loginWithGoogle = async () => {
    setIsLoading(true);
    setError(null);

    const supabase = createClient();
    const origin = window.location.origin;
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback`,
        queryParams: {
          access_type: "offline",
          prompt: "consent"
        }
      }
    });

    if (authError) {
      setError(authError.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl shadow-black/20">
      <div className="mb-8">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--accent)] text-xl font-black text-[#07110f]">
          W
        </div>
        <h1 className="text-2xl font-semibold">Connexion au site projet</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Connecte-toi avec Google. Seules les adresses autorisées par l’équipe peuvent accéder au workspace.
        </p>
      </div>

      <Button className="w-full" onClick={loginWithGoogle} disabled={isLoading || !isConfigured}>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Chrome className="h-4 w-4" />}
        Se connecter avec Google
      </Button>

      {!isConfigured && (
        <p className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-sm leading-6 text-amber-100">
          Configuration Supabase manquante. Crée `.env.local` à partir de `.env.example`, puis ajoute les clés Supabase
          et relance le serveur.
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>
      )}
    </div>
  );
}
