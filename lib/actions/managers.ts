"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canDelete, canWrite, requireProfile } from "@/lib/auth";
import { syncTagsForTarget } from "@/lib/actions/tags";
import { createClient } from "@/lib/supabase/server";
import { emptyDoc } from "@/lib/utils";
import { documentSchema, formString, managerSchema, nullableString } from "@/lib/validation";

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
  const { data, error } = await supabase
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

  if (error) {
    throw new Error(error.message);
  }

  await syncTagsForTarget({
    targetId: data.id,
    targetType: "document",
    tags: parsed.tags
  });

  revalidatePath(`/managers/${managerId}`);
  redirect(`/documents/${data.id}`);
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
