import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock } from "lucide-react";
import { DocumentEditorClient } from "@/components/documents/document-editor-client";
import { DocumentTreeNav } from "@/components/documents/document-tree-nav";
import { Button } from "@/components/ui/button";
import { DeleteButton } from "@/components/ui/delete-button";
import { deleteDocument, updateDocumentOrder } from "@/lib/actions/managers";
import { canDelete, canWrite, requireProfile } from "@/lib/auth";
import { buildInternalLinkTargets } from "@/lib/internal-links";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import type { DocumentManager, DocumentRecord, Profile } from "@/types";

type DocumentWithManager = DocumentRecord & { document_managers: DocumentManager };

type NavigationDocument = Omit<DocumentRecord, "parent_document_id"> & {
  parent_document_id?: string | null;
};

export default async function DocumentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data } = await supabase
    .from("documents")
    .select("*, document_managers(*), users:responsible_id(id,email,full_name,avatar_url), document_tags(tags(id,name,color,created_at))")
    .eq("id", id)
    .maybeSingle();

  if (!data) {
    notFound();
  }

  const document = data as DocumentWithManager;

  const [usersResult, siblingDocumentsResult, allPagesResult, allDocumentsResult] = await Promise.all([
    supabase.from("users").select("*").order("full_name", { ascending: true }),
    supabase
      .from("documents")
      .select("id,manager_id,parent_document_id,title,short_description,sort_order,status,priority,responsible_id,content,created_by,updated_by,created_at,updated_at,document_tags(tags(id,name,color,created_at))")
      .eq("manager_id", document.manager_id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("pages")
      .select("id,parent_page_id,title,category")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("documents")
      .select("id,parent_document_id,title,short_description,document_managers(name)")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
  ]);

  const users = (usersResult.data ?? []) as Profile[];
  let navigationDocuments = (siblingDocumentsResult.data ?? []) as unknown as NavigationDocument[];

  if (siblingDocumentsResult.error) {
    const fallbackDocumentsResult = await supabase
      .from("documents")
      .select("id,manager_id,title,short_description,sort_order,status,priority,responsible_id,content,created_by,updated_by,created_at,updated_at,document_tags(tags(id,name,color,created_at))")
      .eq("manager_id", document.manager_id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    navigationDocuments = (fallbackDocumentsResult.data ?? []) as unknown as NavigationDocument[];
  }

  const siblings = mergeCurrentDocumentIntoNavigation(document, navigationDocuments);
  const writer = canWrite(profile.role);
  const internalLinkTargets = buildInternalLinkTargets(
    allPagesResult.data ?? [],
    (allDocumentsResult.data ?? []) as Parameters<typeof buildInternalLinkTargets>[1]
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
        <Button variant="ghost" size="sm" asChildCompat>
          <Link href={`/managers/${document.manager_id}`}>
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Link>
        </Button>

        <div className="border-t border-[var(--border)] pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            {document.document_managers?.icon} {document.document_managers?.name}
          </p>
          <h2 className="mt-1 text-sm font-semibold">Documents du gestionnaire</h2>
        </div>

        <DocumentTreeNav
          documents={siblings}
          activeDocumentId={document.id}
          compact
          canReorder={writer}
          managerId={document.manager_id}
          onReorder={updateDocumentOrder}
        />
      </aside>

      <main className="min-w-0 space-y-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <Link href={`/managers/${document.manager_id}`} className="text-sm font-medium text-[var(--accent)]">
              {document.document_managers?.icon} {document.document_managers?.name}
            </Link>
            <h1 className="mt-1 text-3xl font-semibold">{document.title}</h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-[var(--muted)]">
              <CalendarClock className="h-4 w-4" />
              Cree {formatDateTime(document.created_at)} - modifie {formatDateTime(document.updated_at)}
            </p>
          </div>
          {canDelete(profile.role) && <DeleteButton action={deleteDocument.bind(null, document.id, document.manager_id)} />}
        </div>

        <DocumentEditorClient document={document} users={users} profile={profile} internalLinkTargets={internalLinkTargets} />
      </main>
    </div>
  );
}

function mergeCurrentDocumentIntoNavigation(current: DocumentWithManager, documents: NavigationDocument[]): DocumentRecord[] {
  const normalized = documents.map((document) => ({
    ...document,
    parent_document_id: document.parent_document_id ?? null
  })) as DocumentRecord[];

  if (normalized.some((document) => document.id === current.id)) {
    return normalized;
  }

  return [{ ...current, parent_document_id: current.parent_document_id ?? null }, ...normalized];
}
