"use client";

import dynamic from "next/dynamic";
import { togglePageFavorite, updatePageContent, updatePageMeta } from "@/lib/actions/pages";
import { Button } from "@/components/ui/button";
import { FavoriteButton } from "@/components/ui/favorite-button";

const RichEditor = dynamic(() => import("@/components/editor/rich-editor").then((m) => m.RichEditor), { ssr: false });
import { IconPickerField } from "@/components/ui/icon-picker-field";
import { Input, Label } from "@/components/ui/input";
import type { InternalLinkTarget, PageRecord, Profile } from "@/types";

export function PageEditorClient({
  page,
  profile,
  internalLinkTargets,
  users = []
}: {
  page: PageRecord;
  profile: Profile;
  internalLinkTargets: InternalLinkTarget[];
  users?: Pick<Profile, "id" | "email" | "full_name">[];
}) {
  const readOnly = profile.role === "reader";

  return (
    <div className="space-y-5">
      <form action={updatePageMeta.bind(null, page.id)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="grid gap-3 md:grid-cols-[10rem_1fr_14rem_auto] md:items-end">
          <IconPickerField defaultValue={page.icon} disabled={readOnly} />
          <div>
            <Label htmlFor="title">Titre</Label>
            <Input id="title" name="title" defaultValue={page.title} disabled={readOnly} />
          </div>
          <div>
            <Label htmlFor="category">Categorie</Label>
            <Input id="category" name="category" defaultValue={page.category} disabled={readOnly} />
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" disabled={readOnly}>
              Enregistrer
            </Button>
            <FavoriteButton
              isFavorite={page.is_favorite ?? false}
              disabled={readOnly}
              onToggle={() => togglePageFavorite(page.id, page.is_favorite ?? false)}
            />
          </div>
        </div>
      </form>

      <RichEditor
        value={page.content}
        readOnly={readOnly}
        internalLinkTargets={internalLinkTargets}
        currentTarget={{ type: "page", id: page.id }}
        users={users}
        onSave={(content, options) => updatePageContent(page.id, content, options)}
        collaboration={{
          id: page.id,
          table: "pages",
          profile
        }}
      />
    </div>
  );
}
