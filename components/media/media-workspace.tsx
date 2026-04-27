"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ExternalLink, GalleryVerticalEnd, Plus, Search } from "lucide-react";
import { createMediaItem, deleteMediaItem, updateMediaItem } from "@/lib/actions/media";
import { getYouTubeThumbnail } from "@/lib/media";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteButton } from "@/components/ui/delete-button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import type { MediaItem, Tag } from "@/types";
import { MEDIA_TYPE_LABELS } from "@/types";

export function MediaWorkspace({
  items,
  canWrite,
  canDelete
}: {
  items: MediaItem[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [tag, setTag] = useState("all");

  const tags = useMemo(() => {
    const map = new Map<string, Tag>();
    items.forEach((item) => {
      item.media_item_tags?.forEach((entry) => {
        if (entry.tags) {
          map.set(entry.tags.name, entry.tags);
        }
      });
    });
    return Array.from(map.values());
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

  return (
    <div className="space-y-5">
      {canWrite && (
        <details className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <summary className="cursor-pointer text-sm font-semibold">Ajouter un média</summary>
          <MediaForm action={createMediaItem} />
        </details>
      )}

      <div className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 lg:grid-cols-[1fr_12rem_12rem]">
        <div className="relative">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un média..." className="pl-9" />
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
        </div>
        <Select value={type} onChange={(event) => setType(event.target.value)}>
          <option value="all">Tous types</option>
          {Object.entries(MEDIA_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
        <Select value={tag} onChange={(event) => setTag(event.target.value)}>
          <option value="all">Tous tags</option>
          {tags.map((item) => (
            <option key={item.id} value={item.name}>{item.name}</option>
          ))}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card className="flex min-h-52 flex-col items-center justify-center p-8 text-center">
          <GalleryVerticalEnd className="mb-3 h-8 w-8 text-[var(--accent)]" />
          <h3 className="font-semibold">Aucun média</h3>
          <p className="mt-2 max-w-md text-sm text-[var(--muted)]">Ajoute une image, une vidéo YouTube, un lien utile ou une référence externe.</p>
        </Card>
      ) : (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <MediaCard key={item.id} item={item} canWrite={canWrite} canDelete={canDelete} />
          ))}
        </section>
      )}
    </div>
  );
}

function MediaCard({ item, canWrite, canDelete }: { item: MediaItem; canWrite: boolean; canDelete: boolean }) {
  const thumbnail = item.type === "youtube" ? getYouTubeThumbnail(item.url) : item.type === "image" ? item.url : null;
  const tags = item.media_item_tags?.map((entry) => entry.tags?.name).filter(Boolean).join(", ") ?? "";

  return (
    <Card className="overflow-hidden">
      <div className="relative flex aspect-video items-center justify-center bg-[var(--surface-elevated)]">
        {thumbnail ? (
          <Image src={thumbnail} alt="" fill className="object-cover" sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw" />
        ) : (
          <GalleryVerticalEnd className="h-8 w-8 text-[var(--muted)]" />
        )}
        <div className="absolute left-3 top-3">
          <Badge tone="accent">{MEDIA_TYPE_LABELS[item.type]}</Badge>
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-semibold">{item.title}</h2>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--muted)]">{item.description ?? item.url}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {item.media_item_tags?.map((entry) =>
            entry.tags ? (
              <span key={entry.tags.id} className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs text-[var(--muted)]">
                {entry.tags.name}
              </span>
            ) : null
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" asChildCompat>
            <a href={item.url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              Ouvrir
            </a>
          </Button>
          {canDelete && <DeleteButton action={deleteMediaItem.bind(null, item.id)} />}
        </div>
        {canWrite && (
          <details className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
            <summary className="cursor-pointer text-sm font-medium">Modifier</summary>
            <MediaForm action={updateMediaItem.bind(null, item.id)} item={item} tags={tags} />
          </details>
        )}
      </div>
    </Card>
  );
}

function MediaForm({
  action,
  item,
  tags = ""
}: {
  action: (formData: FormData) => Promise<void>;
  item?: MediaItem;
  tags?: string;
}) {
  return (
    <form action={action} className="mt-4 grid gap-3 lg:grid-cols-2">
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
        <Button type="submit">
          <Plus className="h-4 w-4" />
          {item ? "Enregistrer" : "Ajouter"}
        </Button>
      </div>
    </form>
  );
}
