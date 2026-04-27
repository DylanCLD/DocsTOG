import { notFound } from "next/navigation";
import { DocumentsWorkspace } from "@/components/documents/documents-workspace";
import { DeleteButton } from "@/components/ui/delete-button";
import { deleteManager } from "@/lib/actions/managers";
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
      .order("updated_at", { ascending: false }),
    supabase.from("users").select("*").order("full_name", { ascending: true })
  ]);

  if (!managerResult.data) {
    notFound();
  }

  const manager = managerResult.data as DocumentManager;
  const documents = (documentsResult.data ?? []) as DocumentRecord[];
  const users = (usersResult.data ?? []) as Profile[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-medium text-[var(--accent)]">Gestionnaire</p>
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

      <DocumentsWorkspace manager={manager} documents={documents} users={users} canWrite={canWrite(profile.role)} />
    </div>
  );
}
