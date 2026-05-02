"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, CornerDownRight, GripVertical } from "lucide-react";
import { buildHierarchy, collectAncestorIds, type HierarchyNode } from "@/lib/hierarchy";
import { cn } from "@/lib/utils";
import type { PageRecord } from "@/types";

type PageReorderAction = (parentPageId: string | null, orderedIds: string[]) => Promise<void>;
type DragState = { id: string; parentId: string | null } | null;
type OrderOverrides = Record<string, string[]>;

export function PageTreeNav({
  pages,
  activePageId,
  defaultOpenAll = false,
  compact = false,
  canReorder = false,
  onReorder
}: {
  pages: PageRecord[];
  activePageId?: string;
  defaultOpenAll?: boolean;
  compact?: boolean;
  canReorder?: boolean;
  onReorder?: PageReorderAction;
}) {
  const router = useRouter();
  const [orderOverrides, setOrderOverrides] = useState<OrderOverrides>({});
  const [dragState, setDragState] = useState<DragState>(null);
  const localPages = useMemo(() => applyOrderOverrides(sortPages(pages), orderOverrides), [orderOverrides, pages]);
  const roots = useMemo(() => buildHierarchy(localPages, (page) => page.parent_page_id), [localPages]);
  const initialOpenIds = useMemo(() => {
    if (defaultOpenAll) {
      const parentIds = new Set(localPages.map((page) => page.parent_page_id).filter(Boolean) as string[]);
      return parentIds;
    }

    if (!activePageId) {
      return new Set<string>();
    }

    const ids = collectAncestorIds(localPages, activePageId, (page) => page.parent_page_id);
    if (localPages.some((page) => page.parent_page_id === activePageId)) {
      ids.add(activePageId);
    }

    return ids;
  }, [activePageId, defaultOpenAll, localPages]);
  const [openIds, setOpenIds] = useState(initialOpenIds);
  const effectiveOpenIds = useMemo(() => new Set([...openIds, ...initialOpenIds]), [initialOpenIds, openIds]);

  const handleDrop = (targetId: string, parentId: string | null, siblingIds: string[], beforeTarget: boolean) => {
    if (!dragState || dragState.parentId !== parentId || dragState.id === targetId) {
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
      void onReorder(parentId, nextIds)
        .then(() => router.refresh())
        .catch(() => {
          setOrderOverrides({});
          router.refresh();
        });
    }
  };

  if (pages.length === 0) {
    return <p className="rounded-lg border border-[var(--border)] p-3 text-sm text-[var(--muted)]">Aucune page.</p>;
  }

  return (
    <nav className={cn("space-y-1", compact ? "text-sm" : "rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2")}>
      {roots.map((node) => (
        <PageTreeNode
          key={node.item.id}
          node={node}
          siblingIds={roots.map((root) => root.item.id)}
          activePageId={activePageId}
          compact={compact}
          canReorder={canReorder && Boolean(onReorder)}
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

function PageTreeNode({
  node,
  siblingIds,
  activePageId,
  compact,
  canReorder,
  dragState,
  setDragState,
  onDrop,
  openIds,
  setOpenIds
}: {
  node: HierarchyNode<PageRecord>;
  siblingIds: string[];
  activePageId?: string;
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
  const isActive = activePageId === node.item.id;
  const parentId = node.item.parent_page_id ?? null;
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
          href={`/pages/${node.item.id}`}
          className={cn(
            "min-w-0 flex-1 rounded-lg px-2 py-2 transition hover:bg-[var(--surface-elevated)]",
            isActive && "bg-[var(--surface-soft)] text-[var(--text)] ring-1 ring-[var(--accent)]",
            compact ? "text-sm" : "text-sm"
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="shrink-0">{node.item.icon}</span>
            <span className="truncate font-medium">{node.item.title}</span>
          </span>
          {!compact && <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">{node.item.category}</span>}
        </Link>
      </div>

      {hasChildren && isOpen && (
        <div className="mt-1 space-y-1 border-l border-[var(--border)]">
          {node.children.map((child) => (
            <PageTreeNode
              key={child.item.id}
              node={child}
              siblingIds={node.children.map((sibling) => sibling.item.id)}
              activePageId={activePageId}
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

function applyOrderOverrides(pages: PageRecord[], orderOverrides: OrderOverrides) {
  let nextPages = pages;

  Object.entries(orderOverrides).forEach(([key, orderedIds]) => {
    const parentId = key === "__root__" ? null : key;
    nextPages = applyLocalPageOrder(nextPages, parentId, orderedIds);
  });

  return nextPages;
}

function applyLocalPageOrder(pages: PageRecord[], parentId: string | null, orderedIds: string[]) {
  const orderById = new Map(orderedIds.map((id, index) => [id, index]));

  return sortPages(
    pages.map((page) => {
      if ((page.parent_page_id ?? null) !== parentId || !orderById.has(page.id)) {
        return page;
      }

      return { ...page, sort_order: orderById.get(page.id) ?? page.sort_order };
    })
  );
}

function parentKey(parentId: string | null) {
  return parentId ?? "__root__";
}

function sortPages(pages: PageRecord[]) {
  return [...pages].sort((a, b) => {
    const orderDelta = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (orderDelta !== 0) {
      return orderDelta;
    }

    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}
