"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, CornerDownRight, FileText, GripVertical, Search, Star } from "lucide-react";
import { PriorityBadge, StatusBadge, TagPills, UserAvatar } from "@/components/documents/document-badges";
import { buildHierarchy, collectAncestorIds, type HierarchyNode } from "@/lib/hierarchy";
import { cn } from "@/lib/utils";
import type { DocumentPriority, DocumentRecord, DocumentStatus, Profile, Tag } from "@/types";

type DocumentReorderAction = (managerId: string, parentDocumentId: string | null, orderedIds: string[]) => Promise<void>;
type DocumentMoveAction = (managerId: string, documentId: string, parentDocumentId: string | null, orderedIds: string[]) => Promise<void>;
type DragState = { id: string; parentId: string | null } | null;
type DropMode = "before" | "inside" | "after";
type OrderOverrides = Record<string, string[]>;
export type DocumentTreeRecord = Pick<DocumentRecord, "id" | "manager_id" | "parent_document_id" | "title" | "short_description" | "created_at"> & {
  sort_order?: number | null;
  status?: DocumentStatus;
  priority?: DocumentPriority;
  is_favorite?: boolean;
  users?: Pick<Profile, "id" | "email" | "full_name" | "avatar_url"> | null;
  document_tags?: Array<{ tags: Tag | null }>;
};

export function DocumentTreeNav({
  documents,
  activeDocumentId,
  defaultOpenAll = false,
  compact = false,
  canReorder = false,
  managerId,
  onReorder,
  onMove
}: {
  documents: DocumentTreeRecord[];
  activeDocumentId?: string;
  defaultOpenAll?: boolean;
  compact?: boolean;
  canReorder?: boolean;
  managerId?: string;
  onReorder?: DocumentReorderAction;
  onMove?: DocumentMoveAction;
}) {
  const router = useRouter();
  const [orderOverrides, setOrderOverrides] = useState<OrderOverrides>({});
  const [dragState, setDragState] = useState<DragState>(null);
  const [query, setQuery] = useState("");
  const localDocuments = useMemo(() => applyOrderOverrides(sortDocuments(documents), orderOverrides), [documents, orderOverrides]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleDocuments = useMemo(() => filterDocuments(localDocuments, normalizedQuery), [localDocuments, normalizedQuery]);
  const roots = useMemo(() => buildHierarchy(visibleDocuments, (document) => document.parent_document_id), [visibleDocuments]);
  const rootIds = useMemo(() => roots.map((root) => root.item.id), [roots]);
  const initialOpenIds = useMemo(() => {
    if (defaultOpenAll || normalizedQuery) {
      const parentIds = new Set(visibleDocuments.map((document) => document.parent_document_id).filter(Boolean) as string[]);
      return parentIds;
    }

    if (!activeDocumentId) {
      return new Set<string>();
    }

    const ids = collectAncestorIds(visibleDocuments, activeDocumentId, (document) => document.parent_document_id);
    if (visibleDocuments.some((document) => document.parent_document_id === activeDocumentId)) {
      ids.add(activeDocumentId);
    }

    return ids;
  }, [activeDocumentId, defaultOpenAll, normalizedQuery, visibleDocuments]);
  const [openIds, setOpenIds] = useState(initialOpenIds);
  const effectiveOpenIds = useMemo(() => new Set([...openIds, ...initialOpenIds]), [initialOpenIds, openIds]);

  const handleDrop = (
    targetId: string,
    parentId: string | null,
    siblingIds: string[],
    childIds: string[],
    mode: DropMode
  ) => {
    if (!managerId || !dragState || dragState.id === targetId) {
      return;
    }

    if (mode === "inside") {
      const nextChildIds = [...childIds.filter((id) => id !== dragState.id), dragState.id];
      setOrderOverrides((current) => ({
        ...current,
        [parentKey(dragState.parentId)]: current[parentKey(dragState.parentId)]?.filter((id) => id !== dragState.id) ?? [],
        [parentKey(targetId)]: nextChildIds
      }));
      setDragState(null);

      if (onMove) {
        void onMove(managerId, dragState.id, targetId, nextChildIds)
          .then(() => router.refresh())
          .catch(() => {
            setOrderOverrides({});
            router.refresh();
          });
      }

      return;
    }

    if (dragState.parentId !== parentId) {
      return;
    }

    const withoutDragged = siblingIds.filter((id) => id !== dragState.id);
    const targetIndex = withoutDragged.indexOf(targetId);
    if (targetIndex === -1) {
      return;
    }

    const nextIds = [...withoutDragged];
    nextIds.splice(mode === "before" ? targetIndex : targetIndex + 1, 0, dragState.id);
    setOrderOverrides((current) => ({ ...current, [parentKey(parentId)]: nextIds }));
    setDragState(null);

    if (onReorder) {
      void onReorder(managerId, parentId, nextIds)
        .then(() => router.refresh())
        .catch(() => {
          setOrderOverrides({});
          router.refresh();
        });
    }
  };

  const promoteToRoot = (documentId: string) => {
    if (!managerId || !onMove) {
      return;
    }

    const nextRootIds = [...rootIds.filter((id) => id !== documentId), documentId];
    void onMove(managerId, documentId, null, nextRootIds)
      .then(() => router.refresh())
      .catch(() => {
        setOrderOverrides({});
        router.refresh();
      });
  };

  if (documents.length === 0) {
    return <p className="rounded-lg border border-[var(--border)] p-3 text-sm text-[var(--muted)]">Aucun document.</p>;
  }

  return (
    <nav className={cn(compact ? "space-y-1 text-sm" : "space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3")}>
      {documents.length > 6 && (
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filtrer..."
            className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] px-3 pl-8 text-sm text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
          />
        </div>
      )}
      {roots.length === 0 ? (
        <p className="rounded-md border border-[var(--border)] px-3 py-5 text-center text-sm text-[var(--muted)]">Aucun document trouve.</p>
      ) : roots.map((node) => (
        <DocumentTreeNode
          key={node.item.id}
          node={node}
          siblingIds={roots.map((root) => root.item.id)}
          activeDocumentId={activeDocumentId}
          compact={compact}
          canReorder={canReorder && Boolean(managerId && onReorder)}
          canMove={canReorder && Boolean(managerId && onMove)}
          dragState={dragState}
          setDragState={setDragState}
          onDrop={handleDrop}
          onPromoteToRoot={promoteToRoot}
          openIds={effectiveOpenIds}
          setOpenIds={setOpenIds}
        />
      ))}
    </nav>
  );
}

function DocumentTreeNode({
  node,
  siblingIds,
  activeDocumentId,
  compact,
  canReorder,
  canMove,
  dragState,
  setDragState,
  onDrop,
  onPromoteToRoot,
  openIds,
  setOpenIds
}: {
  node: HierarchyNode<DocumentTreeRecord>;
  siblingIds: string[];
  activeDocumentId?: string;
  compact: boolean;
  canReorder: boolean;
  canMove: boolean;
  dragState: DragState;
  setDragState: (value: DragState) => void;
  onDrop: (targetId: string, parentId: string | null, siblingIds: string[], childIds: string[], mode: DropMode) => void;
  onPromoteToRoot: (documentId: string) => void;
  openIds: Set<string>;
  setOpenIds: (value: Set<string>) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = openIds.has(node.item.id);
  const isActive = activeDocumentId === node.item.id;
  const parentId = node.item.parent_document_id ?? null;
  const isDropScope = dragState?.parentId === parentId;
  const canDropInside = canMove && Boolean(dragState && dragState.id !== node.item.id && !containsNode(node, dragState.id));

  const toggle = () => {
    const next = new Set(openIds);
    if (next.has(node.item.id)) {
      next.delete(node.item.id);
    } else {
      next.add(node.item.id);
    }
    setOpenIds(next);
  };

  return (
    <div>
      <div
        draggable={canReorder}
        className={cn(
          "group relative flex items-center gap-1 rounded-md border border-transparent transition-colors",
          canReorder && "cursor-grab active:cursor-grabbing",
          isDropScope && "transition-colors"
        )}
        style={{ paddingLeft: `${node.depth * 0.85}rem` }}
        onDragStart={(event) => {
          if (!canReorder) {
            return;
          }

          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", node.item.id);
          setDragState({ id: node.item.id, parentId });
        }}
        onDragEnd={() => setDragState(null)}
        onDragOver={(event) => {
          if (canReorder && (isDropScope || canDropInside)) {
            event.preventDefault();
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          const offset = (event.clientY - rect.top) / rect.height;
          const mode: DropMode = canDropInside && offset >= 0.32 && offset <= 0.68 ? "inside" : offset < 0.5 ? "before" : "after";
          onDrop(node.item.id, parentId, siblingIds, node.children.map((child) => child.item.id), mode);
        }}
      >
        {node.depth > 0 && <span className="absolute left-2 top-1/2 h-px w-4 bg-[var(--border)]" aria-hidden />}
        {canReorder ? (
          <span
            role="button"
            tabIndex={0}
            title="Deplacer"
            aria-label="Deplacer"
            className="flex h-8 w-6 shrink-0 items-center justify-center rounded-md text-[var(--muted)] transition group-hover:bg-[var(--surface-elevated)] group-hover:text-[var(--text)]"
          >
            <GripVertical className="h-4 w-4" />
          </span>
        ) : null}

        {hasChildren ? (
          <button
            type="button"
            aria-label={isOpen ? "Replier" : "Deplier"}
            onClick={toggle}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]"
          >
            <ChevronRight className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")} />
          </button>
        ) : (
          <span className="h-7 w-7 shrink-0" />
        )}

        {node.depth > 0 && (
          <button
            type="button"
            draggable={false}
            title="Double-clique pour en faire un document normal"
            aria-label="Double-clique pour en faire un document normal"
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (canMove) {
                onPromoteToRoot(node.item.id);
              }
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--accent)] transition hover:bg-[var(--surface-elevated)] hover:text-[var(--accent-strong)]"
          >
            <CornerDownRight className="h-3.5 w-3.5" />
          </button>
        )}

        <Link
          draggable={false}
          href={`/documents/${node.item.id}`}
          className={cn(
            "min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-3 transition hover:bg-[var(--surface-elevated)]",
            isActive && "bg-[var(--surface-soft)] text-[var(--text)] ring-1 ring-[var(--accent)]",
            "text-sm"
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
            {node.item.is_favorite && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />}
            <span className="truncate font-medium">{node.item.title}</span>
            {!compact && (
              <span className="ml-auto flex shrink-0 flex-wrap items-center gap-1.5">
                {node.item.status && <StatusBadge status={node.item.status} />}
                {node.item.priority && <PriorityBadge priority={node.item.priority} />}
                {node.item.document_tags && node.item.document_tags.length > 0 && (
                  <TagPills tags={node.item.document_tags} max={2} />
                )}
                {node.item.users && <UserAvatar user={node.item.users} size="xs" />}
              </span>
            )}
          </span>
          {!compact && node.item.short_description && (
            <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
              {node.item.short_description}
            </span>
          )}
        </Link>
      </div>

      {hasChildren && isOpen && (
        <div className="ml-5 mt-2 space-y-2 border-l border-dashed border-[var(--border)] pl-3">
          {node.children.map((child) => (
            <DocumentTreeNode
              key={child.item.id}
              node={child}
              siblingIds={node.children.map((sibling) => sibling.item.id)}
              activeDocumentId={activeDocumentId}
              compact={compact}
              canReorder={canReorder}
              canMove={canMove}
              dragState={dragState}
              setDragState={setDragState}
              onDrop={onDrop}
              onPromoteToRoot={onPromoteToRoot}
              openIds={openIds}
              setOpenIds={setOpenIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function applyOrderOverrides(documents: DocumentTreeRecord[], orderOverrides: OrderOverrides) {
  let nextDocuments = documents;

  Object.entries(orderOverrides).forEach(([key, orderedIds]) => {
    const parentId = key === "__root__" ? null : key;
    nextDocuments = applyLocalDocumentOrder(nextDocuments, parentId, orderedIds);
  });

  return nextDocuments;
}

function applyLocalDocumentOrder(documents: DocumentTreeRecord[], parentId: string | null, orderedIds: string[]) {
  const orderById = new Map(orderedIds.map((id, index) => [id, index]));

  return sortDocuments(
    documents.map((document) => {
      if ((document.parent_document_id ?? null) !== parentId || !orderById.has(document.id)) {
        return document;
      }

      return { ...document, sort_order: orderById.get(document.id) ?? document.sort_order ?? 0 };
    })
  );
}

function parentKey(parentId: string | null) {
  return parentId ?? "__root__";
}

function containsNode(node: HierarchyNode<DocumentTreeRecord>, id: string): boolean {
  return node.children.some((child) => child.item.id === id || containsNode(child, id));
}

function filterDocuments(documents: DocumentTreeRecord[], query: string) {
  if (!query) {
    return documents;
  }

  const byId = new Map(documents.map((document) => [document.id, document]));
  const keepIds = new Set<string>();

  documents.forEach((document) => {
    const tags = document.document_tags?.map((entry) => entry.tags?.name).filter(Boolean).join(" ") ?? "";
    const haystack = `${document.title} ${document.short_description ?? ""} ${document.status ?? ""} ${document.priority ?? ""} ${tags}`.toLowerCase();
    if (!haystack.includes(query)) {
      return;
    }

    let current: DocumentTreeRecord | undefined = document;
    while (current) {
      keepIds.add(current.id);
      current = current.parent_document_id ? byId.get(current.parent_document_id) : undefined;
    }
  });

  return documents.filter((document) => keepIds.has(document.id));
}

function sortDocuments(documents: DocumentTreeRecord[]) {
  return [...documents].sort((a, b) => {
    const favDelta = (b.is_favorite ? 1 : 0) - (a.is_favorite ? 1 : 0);
    if (favDelta !== 0) {
      return favDelta;
    }

    const orderDelta = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (orderDelta !== 0) {
      return orderDelta;
    }

    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}
