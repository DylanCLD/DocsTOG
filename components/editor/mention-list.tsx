"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { Profile } from "@/types";
import { getInitials } from "@/lib/utils";

export type MentionListRef = {
  onKeyDown: (event: KeyboardEvent) => boolean;
};

type MentionItem = Pick<Profile, "id" | "email" | "full_name">;

export const MentionList = forwardRef<MentionListRef, { items: MentionItem[]; command: (item: MentionItem) => void }>(
  function MentionList({ items, command }, ref) {
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
      <div className="min-w-[200px] rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 shadow-xl">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${
              index === selectedIndex
                ? "bg-[var(--surface-elevated)] text-[var(--text)]"
                : "text-[var(--muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]"
            }`}
            onMouseDown={(e) => {
              e.preventDefault();
              command(item);
            }}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-soft)] text-[10px] font-semibold">
              {getInitials(item.full_name ?? item.email)}
            </span>
            <span className="truncate">{item.full_name ?? item.email}</span>
          </button>
        ))}
      </div>
    );
  }
);
