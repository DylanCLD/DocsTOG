// Pure edits on stored editor content (Tiptap JSON), used by the MCP write tools.
// Nothing here touches the database or the editor: every function returns a new document.

import type { JsonNode } from "@/lib/mcp/markdown-tiptap";

export type EditorDoc = { type: "doc"; content: JsonNode[] };

// Stays well under the request size limits of the hosting platform and of PostgREST.
export const MAX_CONTENT_CHARS = 1_500_000;

const MAX_DEPTH = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEmptyParagraph(block: JsonNode) {
  return block.type === "paragraph" && (!Array.isArray(block.content) || block.content.length === 0);
}

/** The stored document as a doc node; anything malformed is read as an empty document. */
export function asDoc(content: unknown): EditorDoc {
  if (isRecord(content) && content.type === "doc" && Array.isArray(content.content)) {
    return { type: "doc", content: content.content as JsonNode[] };
  }

  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function isEmptyDoc(content: unknown) {
  const { content: blocks } = asDoc(content);
  return blocks.length === 0 || blocks.every(isEmptyParagraph);
}

/** A new document made of `blocks`, or the empty document the app creates when there are none. */
export function docFromBlocks(blocks: JsonNode[]): EditorDoc {
  return { type: "doc", content: blocks.length > 0 ? blocks : [{ type: "paragraph" }] };
}

/**
 * Adds blocks at the end (or the start) without touching the existing ones.
 * An empty document (the single blank paragraph of a new page) is replaced instead of kept.
 */
export function addBlocks(content: unknown, blocks: JsonNode[], position: "start" | "end"): EditorDoc {
  if (isEmptyDoc(content)) {
    return docFromBlocks(blocks);
  }

  const existing = asDoc(content).content;
  return { type: "doc", content: position === "start" ? [...blocks, ...existing] : [...existing, ...blocks] };
}

/**
 * Replaces `find` with `replacement` inside text nodes, keeping structure, marks and
 * everything else as is. Text that formatting splits into several nodes (for example a
 * word that is half bold) is not matched: `find` has to sit inside one run of text.
 */
export function replaceInText(
  content: unknown,
  find: string,
  replacement: string
): { doc: EditorDoc; count: number } {
  const doc = structuredClone(asDoc(content));
  let count = 0;

  const visit = (parent: JsonNode, depth: number) => {
    if (depth > MAX_DEPTH || !Array.isArray(parent.content)) return;

    const next: JsonNode[] = [];
    for (const child of parent.content) {
      if (child.type === "text" && typeof child.text === "string") {
        const parts = child.text.split(find);
        if (parts.length > 1) {
          count += parts.length - 1;
          child.text = parts.join(replacement);
        }

        // ProseMirror forbids empty text nodes.
        if (child.text !== "") next.push(child);
        continue;
      }

      visit(child, depth + 1);
      next.push(child);
    }

    parent.content = next;
  };

  visit(doc as unknown as JsonNode, 0);
  return { doc, count };
}

// ---------------------------------------------------------------------------------------
// What a rewrite from Markdown would lose

// Structure Markdown can always express, so its absence from a rewrite is not a loss.
const PLAIN_NODES = new Set([
  "doc",
  "text",
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell"
]);

const PLAIN_MARKS = new Set(["bold", "italic", "strike", "code", "link"]);

const NODE_LABELS: Record<string, string> = {
  image: "images",
  youtube: "YouTube videos",
  asideBlock: "aside blocks"
};

const MARK_LABELS: Record<string, string> = {
  underline: "underlines",
  highlight: "highlights",
  textStyle: "text colors"
};

export type Inventory = {
  nodes: Set<string>;
  marks: Set<string>;
  images: Set<string>;
  features: Set<string>;
};

/** The rich elements found in a document: the things a Markdown rewrite may not carry over. */
export function inventory(content: unknown): Inventory {
  const found: Inventory = { nodes: new Set(), marks: new Set(), images: new Set(), features: new Set() };
  const seen = new WeakSet<object>();

  const visit = (value: unknown, depth: number) => {
    if (depth > MAX_DEPTH || !isRecord(value) || seen.has(value)) return;
    seen.add(value);

    const type = typeof value.type === "string" ? value.type : "";
    const attrs = isRecord(value.attrs) ? value.attrs : {};

    if (type && !PLAIN_NODES.has(type)) found.nodes.add(type);
    if (type === "image" && typeof attrs.src === "string") found.images.add(attrs.src);
    if (typeof attrs.textAlign === "string" && attrs.textAlign !== "left") found.features.add("text alignment");
    if (Number(attrs.colspan) > 1 || Number(attrs.rowspan) > 1) found.features.add("merged table cells");

    if (Array.isArray(value.marks)) {
      for (const mark of value.marks) {
        const markType = isRecord(mark) && typeof mark.type === "string" ? mark.type : "";
        if (markType && !PLAIN_MARKS.has(markType)) found.marks.add(markType);
      }
    }

    if (Array.isArray(value.content)) {
      for (const child of value.content) visit(child, depth + 1);
    }
  };

  visit(content, 0);
  return found;
}

/**
 * What `after` no longer contains compared to `before`: images (by address), embeds,
 * colors, alignment... Empty when a rewrite would drop nothing the editor added by hand.
 */
export function describeLoss(before: unknown, after: unknown): string[] {
  const was = inventory(before);
  const now = inventory(after);
  const lost: string[] = [];

  const missingImages = [...was.images].filter((src) => !now.images.has(src));
  if (missingImages.length > 0) {
    const shown = missingImages.slice(0, 3).map((src) => (src.startsWith("data:") ? "an embedded image" : src));
    lost.push(
      `${missingImages.length} image${missingImages.length > 1 ? "s" : ""} (${shown.join(", ")}${missingImages.length > 3 ? ", ..." : ""})`
    );
  }

  for (const type of was.nodes) {
    if (type !== "image" && !now.nodes.has(type)) lost.push(NODE_LABELS[type] ?? `${type} elements`);
  }

  for (const mark of was.marks) {
    if (!now.marks.has(mark)) lost.push(MARK_LABELS[mark] ?? `${mark} formatting`);
  }

  for (const feature of was.features) {
    if (!now.features.has(feature)) lost.push(feature);
  }

  return lost;
}
