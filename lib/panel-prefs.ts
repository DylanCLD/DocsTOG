// Layout preferences (panel widths, collapsed state) are stored in cookies so the
// server can render the right width on the first paint: no layout jump on reload.
// This module is isomorphic on purpose: the constants are shared by the server
// (reading the cookies) and by the client hook that writes them.

export type PanelWidthSpec = {
  cookie: string;
  defaultWidth: number;
  min: number;
  max: number;
};

export const SIDEBAR_PANEL: PanelWidthSpec = {
  cookie: "docstog-sidebar-w",
  defaultWidth: 288,
  min: 208,
  max: 440
};

export const TREE_PANEL: PanelWidthSpec = {
  cookie: "docstog-tree-w",
  defaultWidth: 288,
  min: 200,
  max: 520
};

export const TREE_COLLAPSED_COOKIE = "docstog-tree-collapsed";

// The retracted sidebar keeps a slim rail of icons so navigation stays one click away.
export const SIDEBAR_COLLAPSED_COOKIE = "docstog-sidebar-collapsed";
export const SIDEBAR_RAIL_WIDTH = "3.5rem";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function clampPanelWidth(value: number, spec: Pick<PanelWidthSpec, "min" | "max">) {
  return Math.min(spec.max, Math.max(spec.min, Math.round(value)));
}

export function parsePanelWidth(raw: string | undefined, spec: PanelWidthSpec) {
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) ? clampPanelWidth(parsed, spec) : spec.defaultWidth;
}

export function writePanelCookie(name: string, value: string) {
  if (typeof document === "undefined") {
    return;
  }

  try {
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax${secure}`;
  } catch {
    // Cookies can be blocked: the preference then only lives for this page view.
  }
}
