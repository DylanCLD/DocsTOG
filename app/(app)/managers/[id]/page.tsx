import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DocumentsWorkspace } from "@/components/documents/documents-workspace";
import { Button } from "@/components/ui/button";
import { DeleteButton } from "@/components/ui/delete-button";
import { deleteManager, updateDocumentOrder } from "@/lib/actions/managers";
import { canDelete, canWrite, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { DocumentManager, DocumentRecord, Profile } from "@/types";

export default async function ManagerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const [managerResult, documentsResult, usersResult] = await Promise.all([
    supabase.from("document_managers").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("documents")
      .select("*, users:responsible_id(id,email,full_name,avatar_url), document_tags(tags(id,name,color,created_at))")
      .eq("manager_id", id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase.from("users").select("*").order("full_name", { ascending: true })
  ]);

  if (!managerResult.data) {
    notFound();
  }

  const manager = managerResult.data as DocumentManager;
  let documents = (documentsResult.data ?? []) as DocumentRecord[];

  if (documentsResult.error && isMissingSortOrderColumn(documentsResult.error)) {
    const fallbackDocumentsResult = await supabase
      .from("documents")
      .select("*, users:responsible_id(id,email,full_name,avatar_url), document_tags(tags(id,name,color,created_at))")
      .eq("manager_id", id)
      .order("updated_at", { ascending: false });

    documents = (fallbackDocumentsResult.data ?? []) as DocumentRecord[];
  }

  const users = (usersResult.data ?? []) as Profile[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <Button variant="ghost" size="sm" asChildCompat>
            <Link href="/managers">
              <ArrowLeft className="h-4 w-4" />
              Retour aux gestionnaires
            </Link>
          </Button>
          <p className="mt-3 text-sm font-medium text-[var(--accent)]">Gestionnaire</p>
          <h1 className="mt-1 flex items-center gap-3 text-3xl font-semibold">
            <span>{manager.icon}</span>
            {manager.name}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            {manager.description ?? "Documents structurés de ce gestionnaire."}
          </p>
        </div>
        {canDelete(profile.role) && <DeleteButton action={deleteManager.bind(null, manager.id)} />}
      </div>

      <DocumentsWorkspace
        manager={manager}
        documents={documents}
        users={users}
        canWrite={canWrite(profile.role)}
        onReorder={updateDocumentOrder}
      />
    </div>
  );
}

function isMissingSortOrderColumn(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";
  return error.code === "42703" || error.code === "PGRST204" || (message.includes("sort_order") && message.includes("column"));
}
