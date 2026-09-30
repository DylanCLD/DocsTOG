"use client";

import { useCallback, useRef, useState } from "react";
import { clampPanelWidth, writePanelCookie, type PanelWidthSpec } from "@/lib/panel-prefs";

/**
 * Width state for a resizable panel.
 * `resize` updates the width live while dragging; `commit` persists it (cookie),
 * so dragging does not write a cookie on every pointer move.
 */
export function useResizableWidth(spec: PanelWidthSpec, initialWidth?: number) {
  const [width, setWidth] = useState(() => clampPanelWidth(initialWidth ?? spec.defaultWidth, spec));
  const latestWidth = useRef(width);

  const resize = useCallback(
    (next: number) => {
      const clamped = clampPanelWidth(next, spec);
      latestWidth.current = clamped;
      setWidth(clamped);
    },
    [spec]
  );

  const commit = useCallback(() => {
    writePanelCookie(spec.cookie, String(latestWidth.current));
  }, [spec]);

  const reset = useCallback(() => {
    resize(spec.defaultWidth);
    writePanelCookie(spec.cookie, String(spec.defaultWidth));
  }, [resize, spec]);

  return { width, resize, commit, reset, min: spec.min, max: spec.max };
}
