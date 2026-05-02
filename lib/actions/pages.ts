"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canDelete, canWrite, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { emptyDoc } from "@/lib/utils";
import { formString, pageSchema } from "@/lib/validation";

type SupabaseActionError = {
  code?: string;
  message?: string;
};

export async function createPage(formData: FormData) {
  const profile = await requireProfile();
  if (!canWrite(profile.role)) {
    throw new Error("Permission refusée.");
  }

  const parsed = pageSchema.parse({
    title: formString(formData, "title"),
    icon: formString(formData, "icon") || "📄",
    category: formString(formData, "category") || "Général"
  });

  const supabase = await createClient();
  const sortOrder = await nextPageSortOrder(supabase, null);
  let { data, error } = await supabase
    .from("pages")
    .insert({
      ...parsed,
      sort_order: sortOrder,
      content: emptyDoc(),
      created_by: profile.id,
      updated_by: profile.id
    })
    .select("id")
    .single();

  if (error && isMissingParentColumnError(error, "sort_order")) {
    const fallbackResult = await supabase
      .from("pages")
      .insert({
        ...parsed,
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
    throw new Error("Creation de la page impossible.");
  }

  revalidatePath("/pages");
  redirect(`/pages/${data.id}`);
}

export async function createSubPage(parentPageId: string, title: string) {
  const profile = await requireProfile();
  if (!canWrite(profile.role)) {
    throw new Error("Permission refusee.");
  }

  const supabase = await createClient();
  const { data: parent, error: parentError } = await supabase
    .from("pages")
    .select("id,icon,category")
    .eq("id", parentPageId)
    .maybeSingle();

  if (parentError) {
    throw new Error(parentError.message);
  }

  if (!parent) {
    throw new Error("Page parente introuvable.");
  }

  const parsed = pageSchema.parse({
    title,
    icon: parent.icon,
    category: parent.category
  });

  const sortOrder = await nextPageSortOrder(supabase, parent.id);
  const insertData = {
    ...parsed,
    parent_page_id: parent.id,
    sort_order: sortOrder,
    content: emptyDoc(),
    created_by: profile.id,
    updated_by: profile.id
  };

  let { data, error } = await supabase
    .from("pages")
    .insert(insertData)
    .select("id")
    .single();

  if (error && (isMissingParentColumnError(error, "parent_page_id") || isMissingParentColumnError(error, "sort_order"))) {
    const fallbackInsertData = isMissingParentColumnError(error, "parent_page_id")
      ? {
          title: insertData.title,
          icon: insertData.icon,
          category: insertData.category,
          content: insertData.content,
          created_by: insertData.created_by,
          updated_by: insertData.updated_by
        }
      : {
          title: insertData.title,
          icon: insertData.icon,
          category: insertData.category,
          parent_page_id: insertData.parent_page_id,
          content: insertData.content,
          created_by: insertData.created_by,
          updated_by: insertData.updated_by
        };
    const fallbackResult = await supabase.from("pages").insert(fallbackInsertData).select("id").single();
    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Creation de la sous-page impossible.");
  }

  revalidatePath("/pages");
  revalidatePath(`/pages/${parent.id}`);

  return { id: data.id as string, href: `/pages/${data.id}` };
}

function isMissingParentColumnError(error: SupabaseActionError, columnName: string) {
  const message = error.message?.toLowerCase() ?? "";
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    (message.includes(columnName.toLowerCase()) && (message.includes("column") || message.includes("schema cache")))
  );
}

async function nextPageSortOrder(supabase: Awaited<ReturnType<typeof createClient>>, parentPageId: string | null) {
  let query = supabase
    .from("pages")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);

  query = parentPageId ? query.eq("parent_page_id", parentPageId) : query.is("parent_page_id", null);

  const { data, error } = await query.maybeSingle();
  if (error && !isMissingParentColumnError(error, "sort_order")) {
    throw new Error(error.message);
  }

  return typeof data?.sort_order === "number" ? data.sort_order + 1 : 0;
}

export async function createSubPageFromForm(parentPageId: string, formData: FormData) {
  const result = await createSubPage(parentPageId, formString(formData, "title"));
  redirect(result.href);
}

export async function updatePageOrder(parentPageId: string | null, orderedIds: string[]) {
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
    .from("pages")
    .select("id,parent_page_id")
    .in("id", uniqueIds);

  if (error) {
    throw new Error(error.message);
  }

  if ((data ?? []).length !== uniqueIds.length) {
    throw new Error("Certaines pages sont introuvables.");
  }

  const normalizedParentId = parentPageId ?? null;
  const hasInvalidParent = (data ?? []).some((page) => (page.parent_page_id ?? null) !== normalizedParentId);
  if (hasInvalidParent) {
    throw new Error("Les pages doivent appartenir au meme parent pour etre reordonnees.");
  }

  const results = await Promise.all(
    uniqueIds.map((id, index) =>
      supabase
        .from("pages")
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

  revalidatePath("/pages");
}

export async function updatePageMeta(pageId: string, formData: FormData) {
  const profile = await requireProfile();
  if (!canWrite(profile.role)) {
    throw new Error("Permission refusée.");
  }

  const parsed = pageSchema.parse({
    title: formString(formData, "title"),
    icon: formString(formData, "icon") || "📄",
    category: formString(formData, "category") || "Général"
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from("pages")
    .update({
      ...parsed,
      updated_by: profile.id
    })
    .eq("id", pageId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/pages");
  revalidatePath(`/pages/${pageId}`);
}

export async function updatePageContent(pageId: string, content: unknown) {
  const profile = await requireProfile();
  if (!canWrite(profile.role)) {
    throw new Error("Permission refusée.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("pages")
    .update({
      content,
      updated_by: profile.id
    })
    .eq("id", pageId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/pages");
  revalidatePath(`/pages/${pageId}`);
}

export async function deletePage(pageId: string) {
  const profile = await requireProfile();
  if (!canDelete(profile.role)) {
    throw new Error("Seuls les admins peuvent supprimer.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("pages").delete().eq("id", pageId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/pages");
  redirect("/pages");
}
