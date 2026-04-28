import Link from "next/link";
import { FilePlus2, StickyNote } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconPickerField } from "@/components/ui/icon-picker-field";
import { Input, Label } from "@/components/ui/input";
import { createPage } from "@/lib/actions/pages";
import { requireProfile, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import type { PageRecord } from "@/types";

export default async function PagesPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("pages").select("*").order("updated_at", { ascending: false });
  const pages = (data ?? []) as PageRecord[];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-[var(--accent)]">Documentation libre</p>
        <h1 className="mt-1 text-3xl font-semibold">Pages</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Cree des pages riches pour idees, notes de reunion, references et decisions de projet.
        </p>
      </div>

      {canWrite(profile.role) && (
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
            <Button type="submit">
              <FilePlus2 className="h-4 w-4" />
              Creer
            </Button>
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
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {pages.map((page) => (
            <Link key={page.id} href={`/pages/${page.id}`}>
              <Card className="h-full p-4 transition hover:-translate-y-0.5 hover:bg-[var(--surface-elevated)]">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{page.icon}</span>
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{page.title}</h2>
                    <p className="mt-1 text-sm text-[var(--muted)]">{page.category}</p>
                    <p className="mt-4 text-xs text-[var(--muted)]">Modifiee {formatDateTime(page.updated_at)}</p>
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
