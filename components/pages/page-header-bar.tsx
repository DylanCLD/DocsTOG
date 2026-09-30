"use client";

import { PropertiesBar } from "@/components/layout/properties-bar";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteButton } from "@/components/ui/delete-button";
import { FavoriteButton } from "@/components/ui/favorite-button";
import { IconPickerField } from "@/components/ui/icon-picker-field";
import { Input, Label } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { togglePageFavorite, updatePageMeta } from "@/lib/actions/pages";
import type { PageRecord } from "@/types";

export function PageHeaderBar({
  page,
  readOnly,
  createdLabel,
  updatedLabel,
  deleteAction
}: {
  page: Pick<PageRecord, "id" | "title" | "icon" | "category" | "is_favorite">;
  readOnly: boolean;
  createdLabel: string;
  updatedLabel: string;
  deleteAction?: () => Promise<void>;
}) {
  return (
    <PropertiesBar
      leading={<span aria-hidden="true" className="text-2xl leading-none">{page.icon}</span>}
      title={page.title}
      chips={<Badge title="Catégorie">{page.category}</Badge>}
      meta={`Modifiée ${updatedLabel}`}
      metaTitle={`Créée ${createdLabel}`}
      actions={
        <FavoriteButton
          isFavorite={page.is_favorite ?? false}
          disabled={readOnly}
          onToggle={() => togglePageFavorite(page.id, page.is_favorite ?? false)}
        />
      }
    >
      {({ close }) => (
        <>
          <ActionForm
            action={updatePageMeta.bind(null, page.id)}
            successMessage="Page mise à jour."
            onSuccess={close}
            className="grid gap-3 md:grid-cols-[10rem_minmax(0,1fr)_14rem]"
          >
            <IconPickerField defaultValue={page.icon} disabled={readOnly} />
            <div>
              <Label htmlFor="title">Titre</Label>
              <Input id="title" name="title" defaultValue={page.title} disabled={readOnly} required maxLength={140} />
            </div>
            <div>
              <Label htmlFor="category">Catégorie</Label>
              <Input id="category" name="category" defaultValue={page.category} disabled={readOnly} maxLength={80} />
            </div>
            {readOnly ? null : (
              <div className="flex items-center gap-2 md:col-span-3">
                <SubmitButton size="sm" pendingLabel="Enregistrement...">
                  Enregistrer
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
