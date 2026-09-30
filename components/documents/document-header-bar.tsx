"use client";

import { PriorityBadge, StatusBadge, TagPills, UserAvatar } from "@/components/documents/document-badges";
import { PropertiesBar } from "@/components/layout/properties-bar";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { DeleteButton } from "@/components/ui/delete-button";
import { FavoriteButton } from "@/components/ui/favorite-button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { toggleDocumentFavorite, updateDocumentMeta } from "@/lib/actions/managers";
import type { DocumentRecord, Profile } from "@/types";
import { PRIORITY_LABELS, STATUS_LABELS } from "@/types";

export type DocumentHeaderRecord = Pick<
  DocumentRecord,
  | "id"
  | "manager_id"
  | "title"
  | "short_description"
  | "status"
  | "priority"
  | "responsible_id"
  | "is_favorite"
  | "users"
  | "document_tags"
>;

export function DocumentHeaderBar({
  document,
  users,
  readOnly,
  createdLabel,
  updatedLabel,
  deleteAction
}: {
  document: DocumentHeaderRecord;
  users: Profile[];
  readOnly: boolean;
  createdLabel: string;
  updatedLabel: string;
  deleteAction?: () => Promise<void>;
}) {
  const tags = document.document_tags?.map((item) => item.tags?.name).filter(Boolean).join(", ") ?? "";
  const responsibleName = document.users ? (document.users.full_name ?? document.users.email) : null;
  const hasTags = (document.document_tags ?? []).some((item) => item.tags);

  return (
    <PropertiesBar
      title={document.title}
      chips={
        <>
          <StatusBadge status={document.status} />
          <PriorityBadge priority={document.priority} />
          {/* Secondary details only show on very wide screens so the title keeps its room. */}
          {hasTags ? (
            <span className="hidden items-center gap-1.5 2xl:inline-flex">
              <TagPills tags={document.document_tags ?? []} max={3} />
            </span>
          ) : null}
          {document.users ? (
            <span className="inline-flex items-center gap-1.5" title={`Responsable : ${responsibleName}`}>
              <UserAvatar user={document.users} />
              <span className="hidden max-w-[9rem] truncate text-xs text-[var(--muted)] 2xl:inline">{responsibleName}</span>
            </span>
          ) : null}
        </>
      }
      meta={`Modifié ${updatedLabel}`}
      metaTitle={`Créé ${createdLabel}`}
      actions={
        <FavoriteButton
          isFavorite={document.is_favorite ?? false}
          disabled={readOnly}
          onToggle={() => toggleDocumentFavorite(document.id, document.is_favorite ?? false, document.manager_id)}
        />
      }
    >
      {({ close }) => (
        <>
          <ActionForm
            action={updateDocumentMeta.bind(null, document.id)}
            successMessage="Propriétés enregistrées."
            onSuccess={close}
            className="grid gap-3 lg:grid-cols-12"
          >
            <div className="lg:col-span-6">
              <Label htmlFor="title">Titre</Label>
              <Input id="title" name="title" defaultValue={document.title} disabled={readOnly} required maxLength={160} />
            </div>
            <div className="lg:col-span-6">
              <Label htmlFor="tags">Tags</Label>
              <Input id="tags" name="tags" defaultValue={tags} disabled={readOnly} placeholder="combat, économie, UI" />
            </div>
            <div className="lg:col-span-12">
              <Label htmlFor="short_description">Description courte</Label>
              <Textarea
                id="short_description"
                name="short_description"
                defaultValue={document.short_description ?? ""}
                disabled={readOnly}
                maxLength={500}
                className="min-h-16"
              />
            </div>
            <div className="lg:col-span-3">
              <Label htmlFor="status">Statut</Label>
              <Select id="status" name="status" defaultValue={document.status} disabled={readOnly}>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </div>
            <div className="lg:col-span-3">
              <Label htmlFor="priority">Priorité</Label>
              <Select id="priority" name="priority" defaultValue={document.priority} disabled={readOnly}>
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </div>
            <div className="lg:col-span-6">
              <Label htmlFor="responsible_id">Responsable</Label>
              <Select id="responsible_id" name="responsible_id" defaultValue={document.responsible_id ?? ""} disabled={readOnly}>
                <option value="">Non assigné</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.full_name ?? user.email}</option>
                ))}
              </Select>
            </div>
            {readOnly ? null : (
              <div className="flex items-center gap-2 lg:col-span-12">
                <SubmitButton size="sm" pendingLabel="Enregistrement...">
                  Enregistrer les propriétés
                </SubmitButton>
                <Button variant="ghost" size="sm" onClick={close}>
                  Fermer
                </Button>
              </div>
            )}
          </ActionForm>

          {deleteAction ? (
            <div className="mt-3 flex justify-end border-t border-[var(--border)] pt-3">
              <DeleteButton action={deleteAction} />
            </div>
          ) : null}
        </>
      )}
    </PropertiesBar>
  );
}
