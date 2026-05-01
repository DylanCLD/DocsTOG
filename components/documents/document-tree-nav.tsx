"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";
import { buildHierarchy, collectAncestorIds, type HierarchyNode } from "@/lib/hierarchy";
import { cn } from "@/lib/utils";
import type { DocumentRecord } from "@/types";

export function DocumentTreeNav({
  documents,
  activeDocumentId,
  defaultOpenAll = false,
  compact = false
}: {
  documents: DocumentRecord[];
  activeDocumentId?: string;
  defaultOpenAll?: boolean;
  compact?: boolean;
}) {
  const roots = useMemo(() => buildHierarchy(documents, (document) => document.parent_document_id), [documents]);
  const initialOpenIds = useMemo(() => {
    if (defaultOpenAll) {
      const parentIds = new Set(documents.map((document) => document.parent_document_id).filter(Boolean) as string[]);
      return parentIds;
    }

    return activeDocumentId ? collectAncestorIds(documents, activeDocumentId, (document) => document.parent_document_id) : new Set<string>();
  }, [activeDocumentId, defaultOpenAll, documents]);
  const [openIds, setOpenIds] = useState(initialOpenIds);

  if (documents.length === 0) {
    return <p className="rounded-lg border border-[var(--border)] p-3 text-sm text-[var(--muted)]">Aucun document.</p>;
  }

  return (
    <nav className={cn("space-y-1", compact ? "text-sm" : "rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2")}>
      {roots.map((node) => (
        <DocumentTreeNode
          key={node.item.id}
          node={node}
          activeDocumentId={activeDocumentId}
          compact={compact}
          openIds={openIds}
          setOpenIds={setOpenIds}
        />
      ))}
    </nav>
  );
}

function DocumentTreeNode({
  node,
  activeDocumentId,
  compact,
  openIds,
  setOpenIds
}: {
  node: HierarchyNode<DocumentRecord>;
  activeDocumentId?: string;
  compact: boolean;
  openIds: Set<string>;
  setOpenIds: (value: Set<string>) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = openIds.has(node.item.id);
  const isActive = activeDocumentId === node.item.id;

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
      <div className="flex items-center gap-1" style={{ paddingLeft: `${node.depth * 0.85}rem` }}>
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
        <div className="mt-1 space-y-1">
          {node.children.map((child) => (
            <DocumentTreeNode
              key={child.item.id}
              node={child}
              activeDocumentId={activeDocumentId}
              compact={compact}
              openIds={openIds}
              setOpenIds={setOpenIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}
