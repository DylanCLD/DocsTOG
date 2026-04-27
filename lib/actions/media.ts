"use server";

import { revalidatePath } from "next/cache";
import { canDelete, canWrite, requireProfile } from "@/lib/auth";
import { syncTagsForTarget } from "@/lib/actions/tags";
import { createClient } from "@/lib/supabase/server";
import { formString, mediaItemSchema, nullableString } from "@/lib/validation";

export async function createMediaItem(formData: FormData) {
  const profile = await requireProfile();
  if (!canWrite(profile.role)) {
    throw new Error("Permission refusée.");
  }

  const parsed = mediaItemSchema.parse({
    title: formString(formData, "title"),
    type: formString(formData, "type") || "link",
    url: formString(formData, "url"),
    description: nullableString(formString(formData, "description")),
    tags: formString(formData, "tags")
  });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("media_items")
    .insert({
      title: parsed.title,
      type: parsed.type,
      url: parsed.url,
      description: parsed.description,
      created_by: profile.id,
      updated_by: profile.id
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await syncTagsForTarget({ targetId: data.id, targetType: "media", tags: parsed.tags });
  revalidatePath("/media");
}

export async function updateMediaItem(mediaId: string, formData: FormData) {
  const profile = await requireProfile();
  if (!canWrite(profile.role)) {
    throw new Error("Permission refusée.");
  }

  const parsed = mediaItemSchema.parse({
    title: formString(formData, "title"),
    type: formString(formData, "type") || "link",
    url: formString(formData, "url"),
    description: nullableString(formString(formData, "description")),
    tags: formString(formData, "tags")
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from("media_items")
    .update({
      title: parsed.title,
      type: parsed.type,
      url: parsed.url,
      description: parsed.description,
      updated_by: profile.id
    })
    .eq("id", mediaId);

  if (error) {
    throw new Error(error.message);
  }

  await syncTagsForTarget({ targetId: mediaId, targetType: "media", tags: parsed.tags });
  revalidatePath("/media");
}

export async function deleteMediaItem(mediaId: string) {
  const profile = await requireProfile();
  if (!canDelete(profile.role)) {
    throw new Error("Seuls les admins peuvent supprimer.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("media_items").delete().eq("id", mediaId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/media");
}
