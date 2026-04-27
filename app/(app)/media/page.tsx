import { MediaWorkspace } from "@/components/media/media-workspace";
import { canDelete, canWrite, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { MediaItem } from "@/types";

export default async function MediaPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("media_items")
    .select("*, media_item_tags(tags(id,name,color,created_at))")
    .order("updated_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-[var(--accent)]">Bibliothèque</p>
        <h1 className="mt-1 text-3xl font-semibold">Médias</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Centralise les images, vidéos intégrées, documents externes et liens utiles du projet.
        </p>
      </div>

      <MediaWorkspace
        items={(data ?? []) as MediaItem[]}
        canWrite={canWrite(profile.role)}
        canDelete={canDelete(profile.role)}
      />
    </div>
  );
}
