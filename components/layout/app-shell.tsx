"use client";

import { createContext, useCallback, useContext, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ResizeHandle } from "@/components/layout/resize-handle";
import { useResizableWidth } from "@/hooks/use-resizable-width";
import { SIDEBAR_COLLAPSED_COOKIE, SIDEBAR_PANEL, SIDEBAR_RAIL_WIDTH, writePanelCookie } from "@/lib/panel-prefs";

type SidebarCollapse = { collapsed: boolean; toggle: () => void };

const SidebarCollapseContext = createContext<SidebarCollapse | null>(null);

/** Null outside <AppShell>: the sidebar then simply stays expanded. */
export function useSidebarCollapse() {
  return useContext(SidebarCollapseContext);
}

/**
 * Two-column shell: a resizable, retractable sidebar and the page content.
 * The width lives in a CSS variable so only this component re-renders while dragging.
 * Nothing around `children` may set an `overflow`: the editor toolbar is `sticky`.
 */
export function AppShell({
  sidebar,
  children,
  initialSidebarWidth,
  initialSidebarCollapsed
}: {
  sidebar: ReactNode;
  children: ReactNode;
  initialSidebarWidth: number;
  initialSidebarCollapsed: boolean;
}) {
  const panel = useResizableWidth(SIDEBAR_PANEL, initialSidebarWidth);
  const [collapsed, setCollapsed] = useState(initialSidebarCollapsed);

  const toggle = useCallback(() => {
    const next = !collapsed;
    setCollapsed(next);
    writePanelCookie(SIDEBAR_COLLAPSED_COOKIE, next ? "1" : "0");
  }, [collapsed]);

  // Memoised so dragging the resize handle does not re-render the sidebar.
  const collapse = useMemo(() => ({ collapsed, toggle }), [collapsed, toggle]);

  return (
    <SidebarCollapseContext.Provider value={collapse}>
      <div
        className="min-h-dvh lg:grid lg:grid-cols-[var(--sidebar-w)_minmax(0,1fr)]"
        style={{ "--sidebar-w": collapsed ? SIDEBAR_RAIL_WIDTH : `${panel.width}px` } as CSSProperties}
      >
        <div className="relative lg:sticky lg:top-0 lg:h-dvh">
          {sidebar}
          {collapsed ? null : (
            <ResizeHandle
              label="Largeur de la barre latérale"
              value={panel.width}
              min={panel.min}
              max={panel.max}
              onResize={panel.resize}
              onCommit={panel.commit}
              onReset={panel.reset}
              className="-right-1.5 hidden lg:block"
            />
          )}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </SidebarCollapseContext.Provider>
  );
}
