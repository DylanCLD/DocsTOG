"use client";

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";

type Heading = {
  level: number;
  text: string;
  id: string;
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

function extractHeadings(editor: Editor): Heading[] {
  const headings: Heading[] = [];
  const seen = new Map<string, number>();

  editor.state.doc.forEach((node) => {
    if (node.type.name === "heading") {
      const text = node.textContent;
      const base = slugify(text) || "heading";
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      const id = count === 0 ? base : `${base}-${count}`;
      headings.push({ level: node.attrs.level as number, text, id });
    }
  });

  return headings;
}

export function TableOfContents({ editor }: { editor: Editor | null }) {
  const [headings, setHeadings] = useState<Heading[]>([]);

  useEffect(() => {
    if (!editor) return;

    const update = () => setHeadings(extractHeadings(editor));
    update();
    editor.on("update", update);
    return () => { editor.off("update", update); };
  }, [editor]);

  if (headings.length === 0) return null;

  return (
    <nav className="sticky top-16 hidden xl:block">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Sommaire</p>
      <ul className="space-y-1">
        {headings.map((heading, i) => (
          <li key={`${heading.id}-${i}`}>
            <button
              type="button"
              className={`block w-full truncate text-left text-xs text-[var(--muted)] transition hover:text-[var(--text)] ${
                heading.level === 1 ? "font-semibold" : heading.level === 2 ? "pl-3" : "pl-6"
              }`}
              onClick={() => {
                const el = document.getElementById(heading.id);
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              {heading.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
