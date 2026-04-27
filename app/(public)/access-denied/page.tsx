import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-center shadow-2xl shadow-black/20">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-red-500/15 text-red-200">
          <ShieldX className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold">Accès refusé</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Ton adresse Google n’est pas autorisée sur ce site. Demande à un administrateur de l’ajouter dans les
          paramètres.
        </p>
        <form action={signOut} className="mt-6">
          <Button type="submit" variant="secondary" className="w-full">
            Revenir à la connexion
          </Button>
        </form>
      </div>
    </main>
  );
}
