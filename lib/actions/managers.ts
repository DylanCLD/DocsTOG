"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canDelete, canWrite, requireProfile } from "@/lib/auth";
import { syncTagsForTarget } from "@/lib/actions/tags";
import { createClient } from "@/lib/supabase/server";
import { emptyDoc } from "@/lib/utils";
import { documentSchema, formString, managerSchema, nullableString } from "@/lib/validation";

type SupabaseActionError = {
  code?: string;
  message?: string;
};

export async function createManager(formData: FormData) {
  const profile = await requireProfile();
  if (!canWrite(profile.role)) {
    throw new Error("Permission refusée.");
  }

  const parsed = managerSchema.parse({
    name: formString(formData, "name"),
    icon: formString(formData, "icon") || "📁",
    description: nullableString(formString(formData, "description"))
  });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_managers")
    .insert({
      ...parsed,
      created_by: profile.id,
      updated_by: profile.id
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/managers");
  redirect(`/managers/${data.id}`);
}

export async function deleteManager(managerId: string) {
  const profile = await requireProfile();
  if (!canDelete(profile.role)) {
    throw new Error("Seuls les admins peuvent supprimer.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("document_managers").delete().eq("id", managerId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/managers");
  redirect("/managers");
}

export async function createDocument(managerId: string, formData: FormData) {
  const profile = await requireProfile();
  if (!canWrite(profile.role)) {
    throw new Error("Permission refusée.");
  }

  const parsed = documentSchema.parse({
    title: formString(formData, "title"),
    short_description: nullableString(formString(formData, "short_description")),
    status: formString(formData, "status") || "todo",
    priority: formString(formData, "priority") || "medium",
    responsible_id: nullableString(formString(formData, "responsible_id")),
    tags: formString(formData, "tags")
  });

  const supabase = await createClient();
  const sortOrder = await nextDocumentSortOrder(supabase, managerId, null);
  let { data, error } = await supabase
    .from("documents")
    .insert({
      manager_id: managerId,
      title: parsed.title,
      short_description: parsed.short_description,
      sort_order: sortOrder,
      status: parsed.status,
      priority: parsed.priority,
      responsible_id: parsed.responsible_id,
      content: emptyDoc(),
      created_by: profile.id,
      updated_by: profile.id
    })
    .select("id")
    .single();

  if (error && isMissingParentColumnError(error, "sort_order")) {
    const fallbackResult = await supabase
      .from("documents")
      .insert({
        manager_id: managerId,
        title: parsed.title,
        short_description: parsed.short_description,
        status: parsed.status,
        priority: parsed.priority,
        responsible_id: parsed.responsible_id,
        content: emptyDoc(),
        created_by: profile.id,
        updated_by: profile.id
      })
      .select("id")
      .single();

    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Creation du document impossible.");
  }

  await syncTagsForTarget({
    targetId: data.id,
    targetType: "document",
    tags: parsed.tags
  });

  revalidatePath(`/managers/${managerId}`);
  redirect(`/documents/${data.id}`);
}

export async function createSubDocument(parentDocumentId: string, title: string) {
  const profile = await requireProfile();
  if (!canWrite(profile.role)) {
    throw new Error("Permission refusee.");
  }

  const parsed = documentSchema.parse({
    title,
    status: "todo",
    priority: "medium",
    tags: ""
  });

  const supabase = await createClient();
  const { data: parent, error: parentError } = await supabase
    .from("documents")
    .select("id,manager_id")
    .eq("id", parentDocumentId)
    .maybeSingle();

  if (parentError) {
    throw new Error(parentError.message);
  }

  if (!parent) {
    throw new Error("Document parent introuvable.");
  }

  const sortOrder = await nextDocumentSortOrder(supabase, parent.manager_id, parent.id);
  const insertData = {
    manager_id: parent.manager_id,
    parent_document_id: parent.id,
    title: parsed.title,
    short_description: null,
    sort_order: sortOrder,
    status: parsed.status,
    priority: parsed.priority,
    content: emptyDoc(),
    created_by: profile.id,
    updated_by: profile.id
  };

  let { data, error } = await supabase
    .from("documents")
    .insert(insertData)
    .select("id")
    .single();

  if (error && isMissingParentColumnError(error, "parent_document_id")) {
    throw new Error("La migration des sous-documents n'est pas appliquee en base.");
  }

  if (error && isMissingParentColumnError(error, "sort_order")) {
    const fallbackInsertData = {
      manager_id: insertData.manager_id,
      parent_document_id: insertData.parent_document_id,
      title: insertData.title,
      short_description: insertData.short_description,
      status: insertData.status,
      priority: insertData.priority,
      content: insertData.content,
      created_by: insertData.created_by,
      updated_by: insertData.updated_by
    };
    const fallbackResult = await supabase.from("documents").insert(fallbackInsertData).select("id").single();
    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Creation du sous-document impossible.");
  }

  revalidatePath("/managers");
  revalidatePath(`/managers/${parent.manager_id}`);
  revalidatePath(`/documents/${parent.id}`);

  return { id: data.id as string, href: `/documents/${data.id}` };
}

function isMissingParentColumnError(error: SupabaseActionError, columnName: string) {
  const message = error.message?.toLowerCase() ?? "";
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    (message.includes(columnName.toLowerCase()) && (message.includes("column") || message.includes("schema cache")))
  );
}

async function nextDocumentSortOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  managerId: string,
  parentDocumentId: string | null
) {
  let query = supabase
    .from("documents")
    .select("sort_order")
    .eq("manager_id", managerId)
    .order("sort_order", { ascending: false })
    .limit(1);

  query = parentDocumentId ? query.eq("parent_document_id", parentDocumentId) : query.is("parent_document_id", null);

  const { data, error } = await query.maybeSingle();
  if (error && !isMissingParentColumnError(error, "sort_order")) {
    throw new Error(error.message);
  }

  return typeof data?.sort_order === "number" ? data.sort_order + 1 : 0;
}

export async function createSubDocumentFromForm(parentDocumentId: string, formData: FormData) {
  const result = await createSubDocument(parentDocumentId, formString(formData, "title"));
  redirect(result.href);
}

export async function updateDocumentOrder(managerId: string, parentDocumentId: string | null, orderedIds: string[]) {
  const profile = await requireProfile();
  if (!canWrite(profile.role)) {
    throw new Error("Permission refusee.");
  }

  const uniqueIds = Array.from(new Set(orderedIds));
  if (uniqueIds.length !== orderedIds.length) {
    throw new Error("Ordre invalide.");
  }

  if (uniqueIds.length === 0) {
    return;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id,manager_id")
    .in("id", uniqueIds)
    .eq("manager_id", managerId);

  if (error) {
    throw new Error(error.message);
  }

  if ((data ?? []).length !== uniqueIds.length) {
    throw new Error("Certains documents sont introuvables ou n'appartiennent pas a ce gestionnaire.");
  }

  const results = await Promise.all(
    uniqueIds.map((id, index) =>
      supabase
        .from("documents")
        .update({
          sort_order: index,
          updated_by: profile.id
        })
        .eq("id", id)
    )
  );
  const updateError = results.find((result) => result.error)?.error;

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath("/managers");
  revalidatePath(`/managers/${managerId}`);
}

export async function moveDocumentInTree(
  managerId: string,
  documentId: string,
  parentDocumentId: string | null,
  orderedIds: string[]
) {
  const profile = await requireProfile();
  if (!canWrite(profile.role)) {
    throw new Error("Permission refusee.");
  }

  const uniqueIds = Array.from(new Set(orderedIds));
  if (uniqueIds.length !== orderedIds.length || !uniqueIds.includes(documentId)) {
    throw new Error("Deplacement invalide.");
  }

  if (parentDocumentId === documentId) {
    throw new Error("Un document ne peut pas etre son propre parent.");
  }

  const supabase = await createClient();
  const { data: managerDocuments, error: documentsError } = await supabase
    .from("documents")
    .select("id,manager_id,parent_document_id")
    .eq("manager_id", managerId);

  if (documentsError) {
    throw new Error(documentsError.message);
  }

  const documents = managerDocuments ?? [];
  const byId = new Map(documents.map((document) => [document.id, document]));
  const movedDocument = byId.get(documentId);

  if (!movedDocument) {
    throw new Error("Document introuvable.");
  }

  if (parentDocumentId && !byId.has(parentDocumentId)) {
    throw new Error("Document parent introuvable.");
  }

  const unknownOrderedId = uniqueIds.find((id) => !byId.has(id));
  if (unknownOrderedId) {
    throw new Error("Certains documents sont introuvables.");
  }

  let currentParent = parentDocumentId ? byId.get(parentDocumentId) : null;
  while (currentParent) {
    if (currentParent.id === documentId) {
      throw new Error("Impossible de deplacer un document dans l'un de ses enfants.");
    }

    currentParent = currentParent.parent_document_id ? byId.get(currentParent.parent_document_id) ?? null : null;
  }

  const results = await Promise.all(
    uniqueIds.map((id, index) =>
      supabase
        .from("documents")
        .update({
          parent_document_id: parentDocumentId,
          sort_order: index,
          updated_by: profile.id
        })
        .eq("id", id)
        .eq("manager_id", managerId)
    )
  );
  const updateError = results.find((result) => result.error)?.error;

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath("/managers");
  revalidatePath(`/managers/${managerId}`);
  revalidatePath(`/documents/${documentId}`);
}

export async function updateDocumentMeta(documentId: string, formData: FormData) {
  const profile = await requireProfile();
  if (!canWrite(profile.role)) {
    throw new Error("Permission refusée.");
  }

  const parsed = documentSchema.parse({
    title: formString(formData, "title"),
    short_description: nullableString(formString(formData, "short_description")),
    status: formString(formData, "status") || "todo",
    priority: formString(formData, "priority") || "medium",
    responsible_id: nullableString(formString(formData, "responsible_id")),
    tags: formString(formData, "tags")
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from("documents")
    .update({
      title: parsed.title,
      short_description: parsed.short_description,
      status: parsed.status,
      priority: parsed.priority,
      responsible_id: parsed.responsible_id,
      updated_by: profile.id
    })
    .eq("id", documentId);

  if (error) {
    throw new Error(error.message);
  }

  await syncTagsForTarget({
    targetId: documentId,
    targetType: "document",
    tags: parsed.tags
  });

  revalidatePath("/managers");
  revalidatePath(`/documents/${documentId}`);
}

export async function updateDocumentContent(documentId: string, content: unknown) {
  const profile = await requireProfile();
  if (!canWrite(profile.role)) {
    throw new Error("Permission refusée.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("documents")
    .update({
      content,
      updated_by: profile.id
    })
    .eq("id", documentId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/managers");
  revalidatePath(`/documents/${documentId}`);
}

export async function deleteDocument(documentId: string, managerId?: string) {
  const profile = await requireProfile();
  if (!canDelete(profile.role)) {
    throw new Error("Seuls les admins peuvent supprimer.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("documents").delete().eq("id", documentId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/managers");
  if (managerId) {
    revalidatePath(`/managers/${managerId}`);
    redirect(`/managers/${managerId}`);
  }

  redirect("/managers");
}
