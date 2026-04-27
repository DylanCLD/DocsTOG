import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { DocumentEditorClient } from "@/components/documents/document-editor-client";
import { DeleteButton } from "@/components/ui/delete-button";
import { deleteDocument } from "@/lib/actions/managers";
import { canDelete, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import type { DocumentManager, DocumentRecord, Profile } from "@/types";

export default async function DocumentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const [documentResult, usersResult] = await Promise.all([
    supabase
      .from("documents")
      .select("*, document_managers(*), users:responsible_id(id,email,full_name,avatar_url), document_tags(tags(id,name,color,created_at))")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("users").select("*").order("full_name", { ascending: true })
  ]);

  if (!documentResult.data) {
    notFound();
  }

  const document = documentResult.data as DocumentRecord & { document_managers: DocumentManager };
  const users = (usersResult.data ?? []) as Profile[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <Link href={`/managers/${document.manager_id}`} className="text-sm font-medium text-[var(--accent)]">
            {document.document_managers?.icon} {document.document_managers?.name}
          </Link>
          <h1 className="mt-1 text-3xl font-semibold">{document.title}</h1>
          <p className="mt-2 flex items-center gap-2 text-sm text-[var(--muted)]">
            <CalendarClock className="h-4 w-4" />
            Créé {formatDateTime(document.created_at)} · modifié {formatDateTime(document.updated_at)}
          </p>
        </div>
        {canDelete(profile.role) && <DeleteButton action={deleteDocument.bind(null, document.id, document.manager_id)} />}
      </div>

      <DocumentEditorClient document={document} users={users} profile={profile} />
    </div>
  );
}
