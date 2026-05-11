import { FolderKanban, Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { IconPickerField } from "@/components/ui/icon-picker-field";
import { Input, Label, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ManagersListClient } from "@/components/managers/managers-list-client";
import { createManager } from "@/lib/actions/managers";
import { canWrite, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { DocumentManager } from "@/types";

type ManagerWithCount = DocumentManager & {
  documents?: Array<{ count: number }>;
};

export default async function ManagersPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("document_managers")
    .select("*, documents(count)")
    .order("name", { ascending: true });
  const managers = (data ?? []) as ManagerWithCount[];

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
          <form action={createManager} className="mt-4 grid gap-3 md:grid-cols-[10rem_1fr_auto] md:items-end">
            <IconPickerField defaultValue="📁" />
            <div>
              <Label htmlFor="name">Nom</Label>
              <Input id="name" name="name" placeholder="Système, Lore, Bugs..." required />
            </div>
            <SubmitButton pendingLabel="Création...">
              <Plus className="h-4 w-4" />
              Créer
            </SubmitButton>
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
        <ManagersListClient managers={managers} />
      )}
    </div>
  );
}
