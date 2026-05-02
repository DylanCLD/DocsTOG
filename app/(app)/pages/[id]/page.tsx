import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock } from "lucide-react";
import { PageEditorClient } from "@/components/pages/page-editor-client";
import { PageTreeNav } from "@/components/pages/page-tree-nav";
import { Button } from "@/components/ui/button";
import { DeleteButton } from "@/components/ui/delete-button";
import { deletePage, movePageInTree, updatePageOrder } from "@/lib/actions/pages";
import { canDelete, canWrite, requireProfile } from "@/lib/auth";
import { buildInternalLinkTargets } from "@/lib/internal-links";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import type { PageRecord } from "@/types";

export default async function PageDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("pages").select("*").eq("id", id).maybeSingle();

  if (!data) {
    notFound();
  }

  const page = data as PageRecord;
  const [allPagesResult, allDocumentsResult] = await Promise.all([
    supabase
      .from("pages")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("documents")
      .select("id,parent_document_id,title,short_description,document_managers(name)")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
  ]);
  let pages = (allPagesResult.data ?? []) as PageRecord[];
  let allDocuments = (allDocumentsResult.data ?? []) as Parameters<typeof buildInternalLinkTargets>[1];

  if (allPagesResult.error && isMissingSortOrderColumn(allPagesResult.error)) {
    const fallbackPagesResult = await supabase.from("pages").select("*").order("created_at", { ascending: true });
    pages = (fallbackPagesResult.data ?? []) as PageRecord[];
  }

  if (allDocumentsResult.error && isMissingSortOrderColumn(allDocumentsResult.error)) {
    const fallbackDocumentsResult = await supabase
      .from("documents")
      .select("id,parent_document_id,title,short_description,document_managers(name)")
      .order("created_at", { ascending: true });

    allDocuments = (fallbackDocumentsResult.data ?? []) as Parameters<typeof buildInternalLinkTargets>[1];
  }

  const writer = canWrite(profile.role);
  const internalLinkTargets = buildInternalLinkTargets(pages, allDocuments);

  return (
    <div className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
        <Button variant="ghost" size="sm" asChildCompat>
          <Link href="/pages">
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Link>
        </Button>
        <div className="border-t border-[var(--border)] pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Pages</p>
          <h2 className="mt-1 text-sm font-semibold">Arborescence</h2>
        </div>
        <PageTreeNav
          pages={pages}
          activePageId={page.id}
          compact
          canReorder={writer}
          onReorder={updatePageOrder}
          onMove={movePageInTree}
        />
      </aside>

      <main className="min-w-0 space-y-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <p className="text-sm font-medium text-[var(--accent)]">Page</p>
            <h1 className="mt-1 flex items-center gap-3 text-3xl font-semibold">
              <span>{page.icon}</span>
              {page.title}
            </h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-[var(--muted)]">
              <CalendarClock className="h-4 w-4" />
              Créée {formatDateTime(page.created_at)} · modifiée {formatDateTime(page.updated_at)}
            </p>
          </div>
          {canDelete(profile.role) && <DeleteButton action={deletePage.bind(null, page.id)} />}
        </div>

      <PageEditorClient page={page} profile={profile} internalLinkTargets={internalLinkTargets} />
      </main>
    </div>
  );
}

function isMissingSortOrderColumn(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";
  return error.code === "42703" || error.code === "PGRST204" || (message.includes("sort_order") && message.includes("column"));
}
