"use server";

import { createClient } from "@/lib/supabase/server";
import { parseTagsInput } from "@/lib/validation";

const tagColors = ["#3dd6b3", "#8fb3ff", "#f3b862", "#f87171", "#65d68a", "#d9a8ff"];

export async function syncTagsForTarget(input: {
  targetId: string;
  targetType: "document" | "media" | "page";
  tags: string | undefined;
}) {
  const supabase = await createClient();
  const names = parseTagsInput(input.tags);

  const joinTable =
    input.targetType === "document" ? "document_tags" : input.targetType === "media" ? "media_item_tags" : "page_tags";
  const targetColumn =
    input.targetType === "document" ? "document_id" : input.targetType === "media" ? "media_item_id" : "page_id";

  await supabase.from(joinTable).delete().eq(targetColumn, input.targetId);

  if (names.length === 0) {
    return;
  }

  const tagRows = await Promise.all(
    names.map(async (name, index) => {
      const { data } = await supabase
        .from("tags")
        .upsert(
          {
            name,
            color: tagColors[index % tagColors.length]
          },
          {
            onConflict: "name"
          }
        )
        .select("id")
        .single();

      return data;
    })
  );

  const inserts = tagRows
    .filter((tag): tag is { id: string } => Boolean(tag?.id))
    .map((tag) => ({
      [targetColumn]: input.targetId,
      tag_id: tag.id
    }));

  if (inserts.length > 0) {
    await supabase.from(joinTable).insert(inserts);
  }
}
