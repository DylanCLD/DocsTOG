"use client";

import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";

const KEYBOARD_STEP = 16;
const KEYBOARD_STEP_LARGE = 48;

/**
 * Vertical splitter for a panel that sits on its left.
 * Drag with the pointer, use the arrow keys (Shift = larger steps, Home/End = bounds)
 * or double-click to restore the default width.
 */
export function ResizeHandle({
  label,
  value,
  min,
  max,
  onResize,
  onCommit,
  onReset,
  className
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onResize: (next: number) => void;
  onCommit: () => void;
  onReset: () => void;
  className?: string;
}) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    return () => document.body.classList.remove("is-resizing");
  }, []);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: value };
    document.body.classList.add("is-resizing");
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) {
      return;
    }

    onResize(drag.current.startWidth + event.clientX - drag.current.startX);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) {
      return;
    }

    drag.current = null;
    document.body.classList.remove("is-resizing");

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    onCommit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP;
    let next: number | null = null;

    if (event.key === "ArrowLeft") {
      next = value - step;
    } else if (event.key === "ArrowRight") {
      next = value + step;
    } else if (event.key === "Home") {
      next = min;
    } else if (event.key === "End") {
      next = max;
    }

    if (next === null) {
      return;
    }

    event.preventDefault();
    onResize(next);
    onCommit();
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      title="Glisser pour redimensionner, double-clic pour réinitialiser"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
      onDoubleClick={onReset}
      className={cn("group/handle absolute inset-y-0 z-30 w-3 cursor-col-resize touch-none select-none outline-none", className)}
    >
      <span className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-transparent transition-colors group-hover/handle:bg-[var(--accent-border)] group-focus-visible/handle:bg-[var(--accent)] group-active/handle:bg-[var(--accent)]" />
    </div>
  );
}
