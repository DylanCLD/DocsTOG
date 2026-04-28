import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock } from "lucide-react";
import { DocumentEditorClient } from "@/components/documents/document-editor-client";
import { Button } from "@/components/ui/button";
import { DeleteButton } from "@/components/ui/delete-button";
import { deleteDocument } from "@/lib/actions/managers";
import { canDelete, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDateTime } from "@/lib/utils";
import type { DocumentManager, DocumentRecord, Profile } from "@/types";

type DocumentWithManager = DocumentRecord & { document_managers: DocumentManager };

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

  const [usersResult, siblingDocumentsResult] = await Promise.all([
    supabase.from("users").select("*").order("full_name", { ascending: true }),
    supabase
      .from("documents")
      .select("id,title,manager_id,short_description,status,priority,responsible_id,content,created_by,updated_by,created_at,updated_at,document_tags(tags(id,name,color,created_at))")
      .eq("manager_id", document.manager_id)
      .order("updated_at", { ascending: false })
  ]);

  const users = (usersResult.data ?? []) as Profile[];
  const siblings = (siblingDocumentsResult.data ?? []) as unknown as DocumentRecord[];

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

        <nav className="space-y-2">
          {siblings.map((item) => {
            const tags = item.document_tags?.map((entry) => entry.tags).filter(Boolean) ?? [];

            return (
              <Link
                key={item.id}
                href={`/documents/${item.id}`}
                className={cn(
                  "block rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-3 transition hover:bg-[var(--surface-soft)]",
                  item.id === document.id && "border-[var(--accent)] bg-[var(--surface-soft)]"
                )}
              >
                <p className="truncate text-sm font-medium">{item.title}</p>
                {tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag!.id}
                        className="max-w-full truncate rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--muted)]"
                      >
                        {tag!.name}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>
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

        <DocumentEditorClient document={document} users={users} profile={profile} />
      </main>
    </div>
  );
}
