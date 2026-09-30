"use client";

import { useCallback, useEffect, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

type TooltipPlacement = { top: number; left: number; maxWidth: number; below: boolean };

const SHOW_DELAY_MS = 250;
const GAP = 8;
const MIN_SIDE_WIDTH = 176;

type TitleTooltip = {
  /** Callback ref for the element that carries the (possibly truncated) text. */
  bindLabel: (element: HTMLElement | null) => void;
  /** Spread on the interactive element (link) that owns the text. */
  anchorProps: {
    onPointerEnter: (event: PointerEvent<HTMLElement>) => void;
    onPointerLeave: () => void;
    onFocus: (event: FocusEvent<HTMLElement>) => void;
    onBlur: () => void;
  };
  hide: () => void;
  /** Render next to the anchor; it is empty until the tooltip is shown. */
  portal: ReactNode;
};

/**
 * Shows the full title in a floating card when the visible text is truncated.
 * The card is `position: fixed` and portalled, so scrolling panels with an
 * `overflow` (the tree, the sidebar) cannot clip it.
 */
export function useTitleTooltip(text: string, hint?: string | null): TitleTooltip {
  const labelElement = useRef<HTMLElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const [placement, setPlacement] = useState<TooltipPlacement | null>(null);

  const bindLabel = useCallback((element: HTMLElement | null) => {
    labelElement.current = element;
  }, []);

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setPlacement(null);
  }, []);

  const reveal = useCallback((anchor: HTMLElement) => {
    const label = labelElement.current;
    if (label && label.scrollWidth <= label.clientWidth) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const sideSpace = window.innerWidth - rect.right - GAP - 16;

    if (sideSpace >= MIN_SIDE_WIDTH) {
      setPlacement({ top: rect.top + rect.height / 2, left: rect.right + GAP, maxWidth: Math.min(sideSpace, 448), below: false });
    } else {
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - 8 - MIN_SIDE_WIDTH));
      setPlacement({ top: rect.bottom + 6, left, maxWidth: Math.min(window.innerWidth - left - 8, 448), below: true });
    }
  }, []);

  useEffect(() => {
    if (!placement) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        hide();
      }
    };

    window.addEventListener("scroll", hide, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [hide, placement]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const anchorProps: TitleTooltip["anchorProps"] = {
    onPointerEnter: (event) => {
      if (event.pointerType !== "mouse") {
        return;
      }

      const anchor = event.currentTarget;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => reveal(anchor), SHOW_DELAY_MS);
    },
    onPointerLeave: hide,
    onFocus: (event) => {
      if (event.currentTarget.matches(":focus-visible")) {
        reveal(event.currentTarget);
      }
    },
    onBlur: hide
  };

  const portal =
    placement && typeof document !== "undefined"
      ? createPortal(
          <div
            aria-hidden="true"
            className="pointer-events-none fixed z-[60] rounded-md border border-[var(--border)] bg-[var(--surface-soft)] px-2.5 py-1.5 text-xs leading-snug text-[var(--text)] shadow-xl shadow-black/40"
            style={{
              top: placement.top,
              left: placement.left,
              maxWidth: placement.maxWidth,
              transform: placement.below ? undefined : "translateY(-50%)"
            }}
          >
            <span className="block break-words font-medium">{text}</span>
            {hint ? <span className="mt-0.5 block break-words text-[var(--muted)]">{hint}</span> : null}
          </div>,
          document.body
        )
      : null;

  return { bindLabel, anchorProps, hide, portal };
}
