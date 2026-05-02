"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, CornerDownRight, FileText, GripVertical } from "lucide-react";
import { buildHierarchy, collectAncestorIds, type HierarchyNode } from "@/lib/hierarchy";
import { cn } from "@/lib/utils";
import type { DocumentRecord } from "@/types";

type DocumentReorderAction = (managerId: string, parentDocumentId: string | null, orderedIds: string[]) => Promise<void>;
type DragState = { id: string; parentId: string | null } | null;
type OrderOverrides = Record<string, string[]>;
export type DocumentTreeRecord = Pick<DocumentRecord, "id" | "manager_id" | "parent_document_id" | "title" | "short_description" | "created_at"> & {
  sort_order?: number | null;
};

export function DocumentTreeNav({
  documents,
  activeDocumentId,
  defaultOpenAll = false,
  compact = false,
  canReorder = false,
  managerId,
  onReorder
}: {
  documents: DocumentTreeRecord[];
  activeDocumentId?: string;
  defaultOpenAll?: boolean;
  compact?: boolean;
  canReorder?: boolean;
  managerId?: string;
  onReorder?: DocumentReorderAction;
}) {
  const router = useRouter();
  const [orderOverrides, setOrderOverrides] = useState<OrderOverrides>({});
  const [dragState, setDragState] = useState<DragState>(null);
  const localDocuments = useMemo(() => applyOrderOverrides(sortDocuments(documents), orderOverrides), [documents, orderOverrides]);
  const roots = useMemo(() => buildHierarchy(localDocuments, (document) => document.parent_document_id), [localDocuments]);
  const initialOpenIds = useMemo(() => {
    if (defaultOpenAll) {
      const parentIds = new Set(localDocuments.map((document) => document.parent_document_id).filter(Boolean) as string[]);
      return parentIds;
    }

    if (!activeDocumentId) {
      return new Set<string>();
    }

    const ids = collectAncestorIds(localDocuments, activeDocumentId, (document) => document.parent_document_id);
    if (localDocuments.some((document) => document.parent_document_id === activeDocumentId)) {
      ids.add(activeDocumentId);
    }

    return ids;
  }, [activeDocumentId, defaultOpenAll, localDocuments]);
  const [openIds, setOpenIds] = useState(initialOpenIds);
  const effectiveOpenIds = useMemo(() => new Set([...openIds, ...initialOpenIds]), [initialOpenIds, openIds]);

  const handleDrop = (targetId: string, parentId: string | null, siblingIds: string[], beforeTarget: boolean) => {
    if (!managerId || !dragState || dragState.parentId !== parentId || dragState.id === targetId) {
      return;
    }

    const withoutDragged = siblingIds.filter((id) => id !== dragState.id);
    const targetIndex = withoutDragged.indexOf(targetId);
    if (targetIndex === -1) {
      return;
    }

    const nextIds = [...withoutDragged];
    nextIds.splice(beforeTarget ? targetIndex : targetIndex + 1, 0, dragState.id);
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

  if (documents.length === 0) {
    return <p className="rounded-lg border border-[var(--border)] p-3 text-sm text-[var(--muted)]">Aucun document.</p>;
  }

  return (
    <nav className={cn("space-y-1", compact ? "text-sm" : "rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2")}>
      {roots.map((node) => (
        <DocumentTreeNode
          key={node.item.id}
          node={node}
          siblingIds={roots.map((root) => root.item.id)}
          activeDocumentId={activeDocumentId}
          compact={compact}
          canReorder={canReorder && Boolean(managerId && onReorder)}
          dragState={dragState}
          setDragState={setDragState}
          onDrop={handleDrop}
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
  dragState,
  setDragState,
  onDrop,
  openIds,
  setOpenIds
}: {
  node: HierarchyNode<DocumentTreeRecord>;
  siblingIds: string[];
  activeDocumentId?: string;
  compact: boolean;
  canReorder: boolean;
  dragState: DragState;
  setDragState: (value: DragState) => void;
  onDrop: (targetId: string, parentId: string | null, siblingIds: string[], beforeTarget: boolean) => void;
  openIds: Set<string>;
  setOpenIds: (value: Set<string>) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = openIds.has(node.item.id);
  const isActive = activeDocumentId === node.item.id;
  const parentId = node.item.parent_document_id ?? null;
  const isDropScope = dragState?.parentId === parentId;

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
        className={cn("flex items-center gap-1 rounded-md", isDropScope && "transition-colors")}
        style={{ paddingLeft: `${node.depth * 0.85}rem` }}
        onDragOver={(event) => {
          if (canReorder && isDropScope) {
            event.preventDefault();
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          onDrop(node.item.id, parentId, siblingIds, event.clientY < rect.top + rect.height / 2);
        }}
      >
        {canReorder ? (
          <span
            role="button"
            tabIndex={0}
            draggable
            title="Deplacer"
            aria-label="Deplacer"
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", node.item.id);
              setDragState({ id: node.item.id, parentId });
            }}
            onDragEnd={() => setDragState(null)}
            className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded-md text-[var(--muted)] active:cursor-grabbing"
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

        {node.depth > 0 && <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />}

        <Link
          href={`/documents/${node.item.id}`}
          className={cn(
            "min-w-0 flex-1 rounded-lg px-2 py-2 transition hover:bg-[var(--surface-elevated)]",
            isActive && "bg-[var(--surface-soft)] text-[var(--text)] ring-1 ring-[var(--accent)]",
            compact ? "text-sm" : "text-sm"
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
            <span className="truncate font-medium">{node.item.title}</span>
          </span>
          {!compact && (
            <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
              {node.item.short_description ?? "Sans description"}
            </span>
          )}
        </Link>
      </div>

      {hasChildren && isOpen && (
        <div className="mt-1 space-y-1 border-l border-[var(--border)]">
          {node.children.map((child) => (
            <DocumentTreeNode
              key={child.item.id}
              node={child}
              siblingIds={node.children.map((sibling) => sibling.item.id)}
              activeDocumentId={activeDocumentId}
              compact={compact}
              canReorder={canReorder}
              dragState={dragState}
              setDragState={setDragState}
              onDrop={onDrop}
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

function sortDocuments(documents: DocumentTreeRecord[]) {
  return [...documents].sort((a, b) => {
    const orderDelta = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (orderDelta !== 0) {
      return orderDelta;
    }

    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}
