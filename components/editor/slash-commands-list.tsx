"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { SlashCommand } from "@/components/editor/slash-commands";

export type SlashCommandsListRef = {
  onKeyDown: (event: KeyboardEvent) => boolean;
};

export const SlashCommandsList = forwardRef<
  SlashCommandsListRef,
  { items: SlashCommand[]; command: (item: SlashCommand) => void }
>(function SlashCommandsList({ items, command }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        const item = items[selectedIndex];
        if (item) command(item);
        return true;
      }
      return false;
    }
  }));

  if (items.length === 0) return null;

  return (
    <div className="min-w-[220px] max-h-72 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 shadow-xl">
      {items.map((item, index) => (
        <button
          key={item.title}
          type="button"
          className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition ${
            index === selectedIndex
              ? "bg-[var(--surface-elevated)] text-[var(--text)]"
              : "text-[var(--muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]"
          }`}
          onMouseDown={(e) => {
            e.preventDefault();
            command(item);
          }}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-soft)] font-mono text-xs font-bold text-[var(--accent)]">
            {item.icon}
          </span>
          <div>
            <div className="font-medium leading-tight">{item.title}</div>
            <div className="text-xs text-[var(--muted)]">{item.description}</div>
          </div>
        </button>
      ))}
    </div>
  );
});
