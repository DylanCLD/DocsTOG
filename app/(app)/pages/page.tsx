import { FilePlus2, StickyNote } from "lucide-react";
import { PageTreeNav } from "@/components/pages/page-tree-nav";
import { EmptyState } from "@/components/ui/empty-state";
import { IconPickerField } from "@/components/ui/icon-picker-field";
import { Input, Label } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { createPage, movePageInTree, updatePageOrder } from "@/lib/actions/pages";
import { requireProfile, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { PageRecord } from "@/types";

export default async function PagesPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const pagesResult = await supabase
    .from("pages")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  let pages = (pagesResult.data ?? []) as PageRecord[];

  if (pagesResult.error && isMissingSortOrderColumn(pagesResult.error)) {
    const fallbackPagesResult = await supabase.from("pages").select("*").order("updated_at", { ascending: false });
    pages = (fallbackPagesResult.data ?? []) as PageRecord[];
  }

  const writer = canWrite(profile.role);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-[var(--accent)]">Documentation libre</p>
        <h1 className="mt-1 text-3xl font-semibold">Pages</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Cree des pages riches pour idees, notes de reunion, references et decisions de projet.
        </p>
      </div>

      {writer && (
        <form action={createPage} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="grid gap-3 md:grid-cols-[10rem_1fr_14rem_auto] md:items-end">
            <IconPickerField defaultValue="📄" />
            <div>
              <Label htmlFor="title">Titre</Label>
              <Input id="title" name="title" placeholder="Nouvelle page de design..." required />
            </div>
            <div>
              <Label htmlFor="category">Categorie</Label>
              <Input id="category" name="category" defaultValue="General" />
            </div>
            <SubmitButton pendingLabel="Creation...">
              <FilePlus2 className="h-4 w-4" />
              Creer
            </SubmitButton>
          </div>
        </form>
      )}

      {pages.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title="Aucune page creee"
          description="Commence par creer une page pour documenter une idee, une decision ou un systeme."
        />
      ) : (
        <PageTreeNav pages={pages} defaultOpenAll canReorder={writer} onReorder={updatePageOrder} onMove={movePageInTree} />
      )}
    </div>
  );
}

function isMissingSortOrderColumn(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";
  return error.code === "42703" || error.code === "PGRST204" || (message.includes("sort_order") && message.includes("column"));
}
