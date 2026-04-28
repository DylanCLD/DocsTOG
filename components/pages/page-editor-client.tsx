"use client";

import { updatePageContent, updatePageMeta } from "@/lib/actions/pages";
import { RichEditor } from "@/components/editor/rich-editor";
import { Button } from "@/components/ui/button";
import { IconPickerField } from "@/components/ui/icon-picker-field";
import { Input, Label } from "@/components/ui/input";
import type { PageRecord, Profile } from "@/types";

export function PageEditorClient({ page, profile }: { page: PageRecord; profile: Profile }) {
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
          <Button type="submit" disabled={readOnly}>
            Enregistrer
          </Button>
        </div>
      </form>

      <RichEditor
        value={page.content}
        readOnly={readOnly}
        onSave={(content) => updatePageContent(page.id, content)}
        collaboration={{
          id: page.id,
          table: "pages",
          profile
        }}
      />
    </div>
  );
}
