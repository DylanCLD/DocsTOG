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

  function visit(node: unknown) {
    if (!node || typeof node !== "object") {
      return;
    }

    const contentNode = node as JSONContent;
    const src = contentNode.type === "image" && typeof contentNode.attrs?.src === "string" ? contentNode.attrs.src : null;
    if (src) {
      srcs.add(src);
    }

    contentNode.content?.forEach(visit);
  }

  visit(content);
  return Array.from(srcs);
}

export function hasImageSrc(content: unknown, src: string): boolean {
  return extractImageSrcs(content).includes(src);
}
