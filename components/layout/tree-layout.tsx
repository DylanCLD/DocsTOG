"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown, ChevronUp, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { ResizeHandle } from "@/components/layout/resize-handle";
import { useResizableWidth } from "@/hooks/use-resizable-width";
import { TREE_COLLAPSED_COOKIE, TREE_PANEL, writePanelCookie } from "@/lib/panel-prefs";
import { cn } from "@/lib/utils";

const COLLAPSED_RAIL_WIDTH = "2.25rem";

const iconButtonClass =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-[var(--surface-elevated)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

/**
 * Detail-page layout: a resizable, collapsible tree panel next to the content.
 * From `xl` up, collapsing leaves a slim rail. Below `xl` the panel is stacked above the
 * content with a capped height, and collapsing keeps only its header bar.
 * Nothing around `children` may set an `overflow`: the editor toolbar is `sticky`.
 */
export function TreeLayout({
  eyebrow,
  heading,
  tree,
  children,
  initialWidth,
  initialCollapsed
}: {
  eyebrow: string;
  heading: string;
  tree: ReactNode;
  children: ReactNode;
  initialWidth: number;
  initialCollapsed: boolean;
}) {
  const panel = useResizableWidth(TREE_PANEL, initialWidth);
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  // From xl up the panel header button and the rail button are different elements:
  // hand the focus over to the one that takes its place (a no-op while it is display:none).
  const panelButton = useRef<HTMLButtonElement>(null);
  const railButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (!restoreFocus.current) {
      return;
    }

    restoreFocus.current = false;
    (collapsed ? railButton : panelButton).current?.focus();
  }, [collapsed]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    restoreFocus.current = true;
    setCollapsed(next);
    writePanelCookie(TREE_COLLAPSED_COOKIE, next ? "1" : "0");
  };

  return (
    <div
      className="grid gap-4 xl:grid-cols-[var(--tree-w)_minmax(0,1fr)] xl:gap-6"
      style={{ "--tree-w": collapsed ? COLLAPSED_RAIL_WIDTH : `${panel.width}px` } as CSSProperties}
    >
      <div className="min-w-0">
        <div className={cn("relative xl:sticky xl:top-20", collapsed && "xl:hidden")}>
          <aside className="flex max-h-[40vh] flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] xl:max-h-[calc(100dvh-6rem)]">
            <div className={cn("flex items-center gap-2 py-1.5 pl-3 pr-1.5", !collapsed && "border-b border-[var(--border)]")}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">{eyebrow}</p>
                <h2 className="truncate text-sm font-semibold">{heading}</h2>
              </div>
              <button
                ref={panelButton}
                type="button"
                onClick={toggleCollapsed}
                aria-expanded={!collapsed}
                aria-label={collapsed ? "Afficher l'arborescence" : "Masquer l'arborescence"}
                title={collapsed ? "Afficher l'arborescence" : "Masquer l'arborescence"}
                className={iconButtonClass}
              >
                <PanelLeftClose className="hidden h-4 w-4 xl:block" />
                {collapsed ? <ChevronDown className="h-4 w-4 xl:hidden" /> : <ChevronUp className="h-4 w-4 xl:hidden" />}
              </button>
            </div>
            {/* Collapsed: hidden below xl; from xl up the whole panel is replaced by the rail. */}
            <div className={cn("min-h-0 flex-1 overflow-y-auto p-2", collapsed && "hidden")}>{tree}</div>
          </aside>
          <ResizeHandle
            label="Largeur de l'arborescence"
            value={panel.width}
            min={panel.min}
            max={panel.max}
            onResize={panel.resize}
            onCommit={panel.commit}
            onReset={panel.reset}
            className="-right-[1.125rem] hidden xl:block"
          />
        </div>

        {collapsed && (
          <div className="hidden xl:sticky xl:top-20 xl:block">
            <button
              ref={railButton}
              type="button"
              onClick={toggleCollapsed}
              aria-expanded={!collapsed}
              aria-label="Afficher l'arborescence"
              title="Afficher l'arborescence"
              className={cn(iconButtonClass, "h-9 w-9 border border-[var(--border)] bg-[var(--surface)]")}
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
