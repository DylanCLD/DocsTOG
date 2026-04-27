"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canDelete, canWrite, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { emptyDoc } from "@/lib/utils";
import { formString, pageSchema } from "@/lib/validation";

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
  const { data, error } = await supabase
    .from("pages")
    .insert({
      ...parsed,
      content: emptyDoc(),
      created_by: profile.id,
      updated_by: profile.id
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/pages");
  redirect(`/pages/${data.id}`);
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
