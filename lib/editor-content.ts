import type { JSONContent } from "@tiptap/core";

export type EditorTargetTable = "pages" | "documents";

export type ContentSaveOptions = {
  verifyImageSrc?: string;
};

export type ContentSaveResult = {
  updatedAt: string | null;
  imageSrcs: string[];
  verifiedImageSrc?: boolean;
};

export function editorRoom(table: EditorTargetTable, id: string) {
  return `editor-yjs:${table}:${id}`;
}

export function extractImageSrcs(content: unknown): string[] {
  const srcs = new Set<string>();
  const seen = new WeakSet<object>();
  const MAX_DEPTH = 200;

  function visit(node: unknown, depth: number) {
    if (depth > MAX_DEPTH) return;
    if (!node || typeof node !== "object") return;
    if (seen.has(node as object)) return;
    seen.add(node as object);

    const contentNode = node as JSONContent;
    const src = contentNode.type === "image" && typeof contentNode.attrs?.src === "string" ? contentNode.attrs.src : null;
    if (src) {
      srcs.add(src);
    }

    if (Array.isArray(contentNode.content)) {
      for (const child of contentNode.content) {
        visit(child, depth + 1);
      }
    }
  }

  try {
    visit(content, 0);
  } catch (error) {
    console.error("[extractImageSrcs] traversal failed", error);
  }
  return Array.from(srcs);
}

export function hasImageSrc(content: unknown, src: string): boolean {
  return extractImageSrcs(content).includes(src);
}
