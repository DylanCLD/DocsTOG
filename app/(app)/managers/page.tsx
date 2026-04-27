import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label, Textarea } from "@/components/ui/input";
import { createManager } from "@/lib/actions/managers";
import { canWrite, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { DocumentManager } from "@/types";

export default async function ManagersPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("document_managers").select("*").order("name", { ascending: true });
  const managers = (data ?? []) as DocumentManager[];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-[var(--accent)]">Documents structurés</p>
        <h1 className="mt-1 text-3xl font-semibold">Gestionnaires</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Organise les systèmes, le lore, les maps, les bugs et toutes les grandes zones du projet.
        </p>
      </div>

      {canWrite(profile.role) && (
        <details className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <summary className="cursor-pointer text-sm font-semibold">Créer un gestionnaire</summary>
          <form action={createManager} className="mt-4 grid gap-3 md:grid-cols-[5rem_1fr_auto] md:items-end">
            <div>
              <Label htmlFor="icon">Icône</Label>
              <Input id="icon" name="icon" defaultValue="📁" />
            </div>
            <div>
              <Label htmlFor="name">Nom</Label>
              <Input id="name" name="name" placeholder="Système, Lore, Bugs..." required />
            </div>
            <Button type="submit">
              <Plus className="h-4 w-4" />
              Créer
            </Button>
            <div className="md:col-span-3">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" placeholder="Ce que ce gestionnaire contient..." />
            </div>
          </form>
        </details>
      )}

      {managers.length === 0 ? (
        <EmptyState icon={FolderKanban} title="Aucun gestionnaire" description="La migration fournit un seed de base; tu peux aussi créer tes propres gestionnaires ici." />
      ) : (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {managers.map((manager) => (
            <Link key={manager.id} href={`/managers/${manager.id}`}>
              <Card className="h-full p-4 transition hover:-translate-y-0.5 hover:bg-[var(--surface-elevated)]">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{manager.icon}</span>
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{manager.name}</h2>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--muted)]">
                      {manager.description ?? "Gestionnaire de documents projet."}
                    </p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
