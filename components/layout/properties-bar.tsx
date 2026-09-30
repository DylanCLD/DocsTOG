"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Compact page header: icon, title (the page <h1>), summary chips and actions on a
 * single line. The property form lives in a panel that the "Propriétés" button
 * folds and unfolds, so the content starts near the top of the screen.
 * `children` receives `close` to fold the panel after a successful save.
 */
export function PropertiesBar({
  leading,
  title,
  chips,
  meta,
  metaTitle,
  actions,
  children
}: {
  leading?: ReactNode;
  title: string;
  chips?: ReactNode;
  meta?: string;
  metaTitle?: string;
  actions?: ReactNode;
  children: (api: { close: () => void }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <section aria-label="Propriétés" className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-1.5">
        {leading}
        <h1 className="min-w-0 flex-1 basis-40 break-words text-lg font-semibold leading-tight line-clamp-2" title={title}>
          {title}
        </h1>
        {chips ? <div className="flex flex-wrap items-center gap-1.5">{chips}</div> : null}
        {meta ? (
          <span className="hidden whitespace-nowrap text-xs text-[var(--muted)] 2xl:inline" title={metaTitle}>
            {meta}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          {actions}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={panelId}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 text-xs font-medium text-[var(--muted)] transition hover:bg-[var(--surface-elevated)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden 2xl:inline">Propriétés</span>
            <span className="sr-only 2xl:hidden">Propriétés</span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </button>
        </div>
      </div>

      {/* Always mounted (only hidden) so a draft survives folding the panel. */}
      <div id={panelId} hidden={!open} className="border-t border-[var(--border)] p-3">
        {children({ close: () => setOpen(false) })}
        {meta ? (
          <p className="mt-3 text-xs text-[var(--muted)]">{[metaTitle, meta].filter(Boolean).join(" · ")}</p>
        ) : null}
      </div>
    </section>
  );
}
