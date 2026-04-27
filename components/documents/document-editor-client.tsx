"use client";

import { updateDocumentContent, updateDocumentMeta } from "@/lib/actions/managers";
import { RichEditor } from "@/components/editor/rich-editor";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import type { DocumentRecord, Profile } from "@/types";
import { PRIORITY_LABELS, STATUS_LABELS } from "@/types";

export function DocumentEditorClient({
  document,
  users,
  profile
}: {
  document: DocumentRecord;
  users: Profile[];
  profile: Profile;
}) {
  const readOnly = profile.role === "reader";
  const tags = document.document_tags?.map((item) => item.tags?.name).filter(Boolean).join(", ") ?? "";

  return (
    <div className="space-y-5">
      <form action={updateDocumentMeta.bind(null, document.id)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <Label htmlFor="title">Titre</Label>
            <Input id="title" name="title" defaultValue={document.title} disabled={readOnly} />
          </div>
          <div>
            <Label htmlFor="tags">Tags</Label>
            <Input id="tags" name="tags" defaultValue={tags} disabled={readOnly} />
          </div>
          <div className="lg:col-span-2">
            <Label htmlFor="short_description">Description courte</Label>
            <Textarea id="short_description" name="short_description" defaultValue={document.short_description ?? ""} disabled={readOnly} />
          </div>
          <div>
            <Label htmlFor="status">Statut</Label>
            <Select id="status" name="status" defaultValue={document.status} disabled={readOnly}>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="priority">Priorité</Label>
            <Select id="priority" name="priority" defaultValue={document.priority} disabled={readOnly}>
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="responsible_id">Responsable</Label>
            <Select id="responsible_id" name="responsible_id" defaultValue={document.responsible_id ?? ""} disabled={readOnly}>
              <option value="">Non assigné</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.full_name ?? user.email}</option>
              ))}
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={readOnly} className="w-full">
              Enregistrer les propriétés
            </Button>
          </div>
        </div>
      </form>

      <RichEditor value={document.content} readOnly={readOnly} onSave={(content) => updateDocumentContent(document.id, content)} />
    </div>
  );
}
