"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Grid2X2, ListFilter, Plus, Search } from "lucide-react";
import { createDocument } from "@/lib/actions/managers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { formatDateTime, getInitials } from "@/lib/utils";
import type { DocumentManager, DocumentPriority, DocumentRecord, DocumentStatus, Profile, Tag } from "@/types";
import { PRIORITY_LABELS, STATUS_LABELS } from "@/types";

type ViewMode = "cards" | "list";

const statusTones: Record<DocumentStatus, "neutral" | "accent" | "amber" | "green"> = {
  todo: "neutral",
  in_progress: "accent",
  review: "amber",
  done: "green"
};

const priorityTones: Record<DocumentPriority, "neutral" | "amber" | "red"> = {
  low: "neutral",
  medium: "neutral",
  high: "amber",
  critical: "red"
};

export function DocumentsWorkspace({
  manager,
  documents,
  users,
  canWrite
}: {
  manager: DocumentManager;
  documents: DocumentRecord[];
  users: Profile[];
  canWrite: boolean;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [tag, setTag] = useState("all");
  const [responsible, setResponsible] = useState("all");
  const [view, setView] = useState<ViewMode>("cards");

  const tags = useMemo(() => {
    const map = new Map<string, Tag>();
    documents.forEach((document) => {
      document.document_tags?.forEach((item) => {
        if (item.tags) {
          map.set(item.tags.name, item.tags);
        }
      });
    });
    return Array.from(map.values());
  }, [documents]);

  const filtered = useMemo(() => {
    return documents.filter((document) => {
      const searchTarget = `${document.title} ${document.short_description ?? ""}`.toLowerCase();
      const documentTags = document.document_tags?.map((item) => item.tags?.name).filter(Boolean) ?? [];

      return (
        (!query || searchTarget.includes(query.toLowerCase())) &&
        (status === "all" || document.status === status) &&
        (priority === "all" || document.priority === priority) &&
        (responsible === "all" || document.responsible_id === responsible) &&
        (tag === "all" || documentTags.includes(tag))
      );
    });
  }, [documents, priority, query, responsible, status, tag]);

  return (
    <div className="space-y-5">
      {canWrite && (
        <details className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <summary className="cursor-pointer text-sm font-semibold">Créer un document dans {manager.name}</summary>
          <form action={createDocument.bind(null, manager.id)} className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <Label htmlFor="title">Titre</Label>
              <Input id="title" name="title" placeholder="Système d’inventaire" required />
            </div>
            <div>
              <Label htmlFor="tags">Tags</Label>
              <Input id="tags" name="tags" placeholder="combat, économie, UI" />
            </div>
            <div className="lg:col-span-2">
              <Label htmlFor="short_description">Description courte</Label>
              <Textarea id="short_description" name="short_description" placeholder="Résumé rapide du document..." />
            </div>
            <div>
              <Label htmlFor="status">Statut</Label>
              <Select id="status" name="status" defaultValue="todo">
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="priority">Priorité</Label>
              <Select id="priority" name="priority" defaultValue="medium">
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="responsible_id">Responsable</Label>
              <Select id="responsible_id" name="responsible_id" defaultValue="">
                <option value="">Non assigné</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.full_name ?? user.email}</option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                <Plus className="h-4 w-4" />
                Créer le document
              </Button>
            </div>
          </form>
        </details>
      )}

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_10rem_10rem_10rem_12rem_auto]">
          <div className="relative">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher dans les documents..." className="pl-9" />
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          </div>
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">Tous statuts</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
          <Select value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option value="all">Priorités</option>
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
          <Select value={tag} onChange={(event) => setTag(event.target.value)}>
            <option value="all">Tous tags</option>
            {tags.map((item) => (
              <option key={item.id} value={item.name}>{item.name}</option>
            ))}
          </Select>
          <Select value={responsible} onChange={(event) => setResponsible(event.target.value)}>
            <option value="all">Responsables</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.full_name ?? user.email}</option>
            ))}
          </Select>
          <Button variant="secondary" onClick={() => setView(view === "cards" ? "list" : "cards")}>
            {view === "cards" ? <ListFilter className="h-4 w-4" /> : <Grid2X2 className="h-4 w-4" />}
            {view === "cards" ? "Liste" : "Cartes"}
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-[var(--muted)]">Aucun document ne correspond aux filtres.</Card>
      ) : view === "cards" ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((document) => (
            <DocumentCard key={document.id} document={document} />
          ))}
        </section>
      ) : (
        <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          {filtered.map((document) => (
            <Link key={document.id} href={`/documents/${document.id}`} className="grid gap-3 border-b border-[var(--border)] px-4 py-3 transition last:border-b-0 hover:bg-[var(--surface-elevated)] md:grid-cols-[1fr_8rem_8rem_12rem] md:items-center">
              <div className="min-w-0">
                <p className="truncate font-medium">{document.title}</p>
                <p className="truncate text-sm text-[var(--muted)]">{document.short_description ?? "Sans description"}</p>
              </div>
              <Badge tone={statusTones[document.status]}>{STATUS_LABELS[document.status]}</Badge>
              <Badge tone={priorityTones[document.priority]}>{PRIORITY_LABELS[document.priority]}</Badge>
              <p className="truncate text-sm text-[var(--muted)]">{document.users?.full_name ?? document.users?.email ?? "Non assigné"}</p>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}

function DocumentCard({ document }: { document: DocumentRecord }) {
  return (
    <Link href={`/documents/${document.id}`}>
      <Card className="h-full p-4 transition hover:-translate-y-0.5 hover:bg-[var(--surface-elevated)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-semibold">{document.title}</h3>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--muted)]">{document.short_description ?? "Sans description."}</p>
          </div>
          <Badge tone={priorityTones[document.priority]}>{PRIORITY_LABELS[document.priority]}</Badge>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone={statusTones[document.status]}>{STATUS_LABELS[document.status]}</Badge>
          {document.document_tags?.map((item) =>
            item.tags ? (
              <span key={item.tags.id} className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs text-[var(--muted)]">
                {item.tags.name}
              </span>
            ) : null
          )}
        </div>
        <div className="mt-5 flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
          <span>{formatDateTime(document.updated_at)}</span>
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-soft)] text-[10px] font-semibold">
              {getInitials(document.users?.full_name ?? document.users?.email ?? "?")}
            </span>
            {document.users?.full_name ?? document.users?.email ?? "Non assigné"}
          </span>
        </div>
      </Card>
    </Link>
  );
}
