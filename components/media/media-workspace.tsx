"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  Copy,
  ExternalLink,
  Eye,
  GalleryVerticalEnd,
  Grid2X2,
  List,
  Plus,
  Search,
  X
} from "lucide-react";
import { createMediaItem, deleteMediaItem, updateMediaItem } from "@/lib/actions/media";
import { getYouTubeThumbnail } from "@/lib/media";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteButton } from "@/components/ui/delete-button";
import { ActionForm } from "@/components/ui/action-form";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast-provider";
import { cn } from "@/lib/utils";
import type { MediaItem, Tag } from "@/types";
import { MEDIA_TYPE_LABELS } from "@/types";

type MediaView = "grid" | "list";

export function MediaWorkspace({
  items,
  canWrite,
  canDelete
}: {
  items: MediaItem[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const { notify } = useToast();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [tag, setTag] = useState("all");
  const [view, setView] = useState<MediaView>("grid");
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);

  const tags = useMemo(() => {
    const map = new Map<string, Tag>();
    items.forEach((item) => {
      item.media_item_tags?.forEach((entry) => {
        if (entry.tags) {
          map.set(entry.tags.name, entry.tags);
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((item) => counts.set(item.type, (counts.get(item.type) ?? 0) + 1));
    return counts;
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const target = `${item.title} ${item.description ?? ""} ${item.url}`.toLowerCase();
      const itemTags = item.media_item_tags?.map((entry) => entry.tags?.name).filter(Boolean) ?? [];

      return (
        (!query || target.includes(query.toLowerCase())) &&
        (type === "all" || item.type === type) &&
        (tag === "all" || itemTags.includes(tag))
      );
    });
  }, [items, query, tag, type]);

  const hasFilters = Boolean(query.trim()) || type !== "all" || tag !== "all";

  const clearFilters = () => {
    setQuery("");
    setType("all");
    setTag("all");
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      notify("URL du média copiée", "success");
    } catch {
      notify("Copie impossible depuis ce navigateur", "error");
    }
  };

  return (
    <div className="space-y-5">
      {canWrite && (
        <details className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <summary className="cursor-pointer text-sm font-semibold">Ajouter un média</summary>
          <MediaForm action={createMediaItem} successMessage="Média ajouté." resetOnSuccess />
        </details>
      )}

      <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_12rem_12rem_auto]">
          <div className="relative">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un média..." className="pl-9" />
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          </div>
          <Select value={type} onChange={(event) => setType(event.target.value)}>
            <option value="all">Tous types</option>
            {Object.entries(MEDIA_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label} ({typeCounts.get(value) ?? 0})
              </option>
            ))}
          </Select>
          <Select value={tag} onChange={(event) => setTag(event.target.value)}>
            <option value="all">Tous tags</option>
            {tags.map((item) => (
              <option key={item.id} value={item.name}>{item.name}</option>
            ))}
          </Select>
          <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-1">
            <ViewButton label="Grille" active={view === "grid"} onClick={() => setView("grid")}>
              <Grid2X2 className="h-4 w-4" />
            </ViewButton>
            <ViewButton label="Liste" active={view === "list"} onClick={() => setView("list")}>
              <List className="h-4 w-4" />
            </ViewButton>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--muted)]">
          <span>
            {filtered.length} résultat{filtered.length > 1 ? "s" : ""} sur {items.length} média{items.length > 1 ? "s" : ""}
          </span>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--accent)] transition hover:bg-[var(--surface-elevated)]"
            >
              <X className="h-3.5 w-3.5" />
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="flex min-h-52 flex-col items-center justify-center p-8 text-center">
          <GalleryVerticalEnd className="mb-3 h-8 w-8 text-[var(--accent)]" />
          <h3 className="font-semibold">{hasFilters ? "Aucun média trouvé" : "Aucun média"}</h3>
          <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
            {hasFilters ? "Ajuste la recherche ou retire un filtre." : "Ajoute une image, une vidéo YouTube, un lien utile ou une référence externe."}
          </p>
        </Card>
      ) : view === "grid" ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              canWrite={canWrite}
              canDelete={canDelete}
              onCopy={copyUrl}
              onPreview={setPreviewItem}
            />
          ))}
        </section>
      ) : (
        <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          {filtered.map((item) => (
            <MediaRow
              key={item.id}
              item={item}
              canDelete={canDelete}
              onCopy={copyUrl}
              onPreview={setPreviewItem}
            />
          ))}
        </section>
      )}

      {previewItem && <MediaPreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />}
    </div>
  );
}

function MediaCard({
  item,
  canWrite,
  canDelete,
  onCopy,
  onPreview
}: {
  item: MediaItem;
  canWrite: boolean;
  canDelete: boolean;
  onCopy: (url: string) => void;
  onPreview: (item: MediaItem) => void;
}) {
  const thumbnail = mediaThumbnail(item);
  const tags = item.media_item_tags?.map((entry) => entry.tags?.name).filter(Boolean).join(", ") ?? "";

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => thumbnail && onPreview(item)}
        disabled={!thumbnail}
        className="relative flex aspect-video w-full items-center justify-center bg-[var(--surface-elevated)] text-left disabled:cursor-default"
      >
        {thumbnail ? (
          <Image src={thumbnail} alt="" fill className="object-cover transition hover:scale-[1.015]" sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw" />
        ) : (
          <GalleryVerticalEnd className="h-8 w-8 text-[var(--muted)]" />
        )}
        <div className="absolute left-3 top-3">
          <Badge tone="accent">{MEDIA_TYPE_LABELS[item.type]}</Badge>
        </div>
        {thumbnail && (
          <div className="absolute bottom-3 right-3 rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white">
            Prévisualiser
          </div>
        )}
      </button>
      <div className="p-4">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{item.title}</h2>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--muted)]">{item.description ?? item.url}</p>
        </div>
        <TagList item={item} />
        <div className="mt-4 flex flex-wrap gap-2">
          {thumbnail && (
            <Button variant="ghost" size="sm" onClick={() => onPreview(item)}>
              <Eye className="h-4 w-4" />
              Voir
            </Button>
          )}
          <Button variant="secondary" size="sm" asChildCompat>
            <a href={item.url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              Ouvrir
            </a>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onCopy(item.url)}>
            <Copy className="h-4 w-4" />
            Copier
          </Button>
          {canDelete && <DeleteButton action={deleteMediaItem.bind(null, item.id)} successMessage="Média supprimé." />}
        </div>
        {canWrite && (
          <details className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
            <summary className="cursor-pointer text-sm font-medium">Modifier</summary>
            <MediaForm action={updateMediaItem.bind(null, item.id)} item={item} tags={tags} successMessage="Média mis à jour." />
          </details>
        )}
      </div>
    </Card>
  );
}

function MediaRow({
  item,
  canDelete,
  onCopy,
  onPreview
}: {
  item: MediaItem;
  canDelete: boolean;
  onCopy: (url: string) => void;
  onPreview: (item: MediaItem) => void;
}) {
  const thumbnail = mediaThumbnail(item);

  return (
    <div className="grid gap-3 border-b border-[var(--border)] p-3 last:border-b-0 md:grid-cols-[7rem_1fr_auto] md:items-center">
      <button
        type="button"
        onClick={() => thumbnail && onPreview(item)}
        disabled={!thumbnail}
        className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-[var(--surface-elevated)] disabled:cursor-default"
      >
        {thumbnail ? (
          <Image src={thumbnail} alt="" fill className="object-cover" sizes="7rem" />
        ) : (
          <GalleryVerticalEnd className="h-6 w-6 text-[var(--muted)]" />
        )}
      </button>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate font-semibold">{item.title}</h2>
          <Badge tone="accent">{MEDIA_TYPE_LABELS[item.type]}</Badge>
        </div>
        <p className="mt-1 truncate text-sm text-[var(--muted)]">{item.description ?? item.url}</p>
        <TagList item={item} compact />
      </div>
      <div className="flex flex-wrap gap-2 md:justify-end">
        {thumbnail && (
          <Button variant="ghost" size="sm" onClick={() => onPreview(item)}>
            <Eye className="h-4 w-4" />
            Voir
          </Button>
        )}
        <Button variant="secondary" size="sm" asChildCompat>
          <a href={item.url} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" />
            Ouvrir
          </a>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onCopy(item.url)}>
          <Copy className="h-4 w-4" />
          Copier
        </Button>
        {canDelete && <DeleteButton action={deleteMediaItem.bind(null, item.id)} successMessage="Média supprimé." />}
      </div>
    </div>
  );
}

function MediaPreviewModal({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const thumbnail = mediaThumbnail(item);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-5xl overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{item.title}</h2>
            <p className="truncate text-xs text-[var(--muted)]">{item.url}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="bg-black/20 p-4">
          {thumbnail ? (
            <div className="relative mx-auto aspect-video max-h-[70vh] overflow-hidden rounded-lg bg-[var(--surface-elevated)]">
              <Image src={thumbnail} alt={item.title} fill className="object-contain" sizes="100vw" />
            </div>
          ) : (
            <p className="p-8 text-center text-sm text-[var(--muted)]">Aucune prévisualisation disponible.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MediaForm({
  action,
  item,
  tags = "",
  successMessage,
  resetOnSuccess = false
}: {
  action: (formData: FormData) => Promise<void>;
  item?: MediaItem;
  tags?: string;
  successMessage: string;
  resetOnSuccess?: boolean;
}) {
  return (
    <ActionForm action={action} successMessage={successMessage} resetOnSuccess={resetOnSuccess} className="mt-4 grid gap-3 lg:grid-cols-2">
      <div>
        <Label htmlFor={`media-title-${item?.id ?? "new"}`}>Titre</Label>
        <Input id={`media-title-${item?.id ?? "new"}`} name="title" defaultValue={item?.title ?? ""} required />
      </div>
      <div>
        <Label htmlFor={`media-type-${item?.id ?? "new"}`}>Type</Label>
        <Select id={`media-type-${item?.id ?? "new"}`} name="type" defaultValue={item?.type ?? "link"}>
          {Object.entries(MEDIA_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
      </div>
      <div className="lg:col-span-2">
        <Label htmlFor={`media-url-${item?.id ?? "new"}`}>URL</Label>
        <Input id={`media-url-${item?.id ?? "new"}`} name="url" defaultValue={item?.url ?? ""} placeholder="https://..." required />
      </div>
      <div>
        <Label htmlFor={`media-tags-${item?.id ?? "new"}`}>Tags</Label>
        <Input id={`media-tags-${item?.id ?? "new"}`} name="tags" defaultValue={tags} placeholder="référence, trailer, UI" />
      </div>
      <div>
        <Label htmlFor={`media-description-${item?.id ?? "new"}`}>Description</Label>
        <Textarea id={`media-description-${item?.id ?? "new"}`} name="description" defaultValue={item?.description ?? ""} />
      </div>
      <div className="lg:col-span-2">
        <SubmitButton pendingLabel={item ? "Enregistrement..." : "Ajout..."}>
          <Plus className="h-4 w-4" />
          {item ? "Enregistrer" : "Ajouter"}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

function ViewButton({
  children,
  label,
  active,
  onClick
}: {
  children: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--text)]",
        active && "bg-[var(--surface-soft)] text-[var(--text)]"
      )}
    >
      {children}
    </button>
  );
}

function TagList({ item, compact = false }: { item: MediaItem; compact?: boolean }) {
  const tags = item.media_item_tags?.filter((entry) => entry.tags) ?? [];

  if (tags.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap gap-2", compact ? "mt-2" : "mt-4")}>
      {tags.map((entry) =>
        entry.tags ? (
          <span key={entry.tags.id} className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs text-[var(--muted)]">
            {entry.tags.name}
          </span>
        ) : null
      )}
    </div>
  );
}

function mediaThumbnail(item: MediaItem) {
  return item.type === "youtube" ? getYouTubeThumbnail(item.url) : item.type === "image" ? item.url : null;
}
