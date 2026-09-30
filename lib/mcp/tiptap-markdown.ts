// Turns the editor content stored in pages.content / documents.content (Tiptap JSON)
// into Markdown or plain text, so an MCP client can read it. Pure and dependency-free;
// unknown or malformed nodes degrade to their text instead of throwing.

type TiptapNode = {
  type?: unknown;
  attrs?: unknown;
  content?: unknown;
  text?: unknown;
  marks?: unknown;
};

const MAX_DEPTH = 60;
const MARKS_RE = /[̀-ͯ]/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function childrenOf(node: unknown): TiptapNode[] {
  const content = isRecord(node) ? node.content : undefined;
  return Array.isArray(content) ? content.filter(isRecord) : [];
}

function typeOf(node: TiptapNode) {
  return typeof node.type === "string" ? node.type : "";
}

function attr(node: TiptapNode, name: string): unknown {
  return isRecord(node.attrs) ? node.attrs[name] : undefined;
}

function attrString(node: TiptapNode, name: string) {
  const value = attr(node, name);
  return typeof value === "string" ? value : "";
}

function markList(node: TiptapNode): Array<{ type: string; attrs: Record<string, unknown> }> {
  if (!Array.isArray(node.marks)) {
    return [];
  }

  return node.marks.filter(isRecord).map((mark) => ({
    type: typeof mark.type === "string" ? mark.type : "",
    attrs: isRecord(mark.attrs) ? mark.attrs : {}
  }));
}

/** Wraps a destination in <...> when it contains characters that would end the Markdown link early. */
function destination(url: string) {
  return /[\s()]/.test(url) ? `<${url}>` : url;
}

function inlineCode(text: string) {
  const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longestRun + 1);
  const padded = text.startsWith("`") || text.endsWith("`") ? ` ${text} ` : text;
  return `${fence}${padded}${fence}`;
}

/** Applies a Markdown wrapper while keeping surrounding whitespace outside of it. */
function wrap(text: string, marker: string) {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  if (!match || !match[2]) {
    return text;
  }

  return `${match[1]}${marker}${match[2]}${marker}${match[3]}`;
}

function renderText(node: TiptapNode) {
  let text = typeof node.text === "string" ? node.text : "";
  const marks = markList(node);
  const types = new Set(marks.map((mark) => mark.type));

  if (types.has("code")) {
    text = inlineCode(text);
  } else {
    if (types.has("bold")) text = wrap(text, "**");
    if (types.has("italic")) text = wrap(text, "*");
    if (types.has("strike")) text = wrap(text, "~~");
  }

  const link = marks.find((mark) => mark.type === "link");
  const href = typeof link?.attrs.href === "string" ? link.attrs.href.trim() : "";
  if (href && text.trim()) {
    text = `[${text}](${destination(href)})`;
  }

  return text;
}

function renderImage(node: TiptapNode) {
  const src = attrString(node, "src");
  const alt = (attrString(node, "alt") || attrString(node, "title")).replace(/[[\]]/g, " ").trim();

  if (!src) {
    return "";
  }

  // Pasted images that were embedded as data URLs can be megabytes: never dump them.
  if (src.startsWith("data:")) {
    return `[embedded image omitted${alt ? `: ${alt}` : ""}]`;
  }

  return `![${alt}](${destination(src)})`;
}

function renderInline(nodes: TiptapNode[], depth: number): string {
  if (depth > MAX_DEPTH) {
    return "";
  }

  return nodes
    .map((node) => {
      const type = typeOf(node);

      if (type === "text") return renderText(node);
      if (type === "hardBreak") return "  \n";
      if (type === "image") return renderImage(node);

      // Any other inline node: keep its text content.
      return renderInline(childrenOf(node), depth + 1);
    })
    .join("");
}

function indentContinuation(text: string, spaces: number) {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line, index) => (index === 0 || line === "" ? line : `${pad}${line}`))
    .join("\n");
}

function quote(text: string) {
  return text
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
}

function renderBlocks(nodes: TiptapNode[], depth: number): string {
  return nodes
    .map((node) => renderBlock(node, depth + 1))
    .filter((block) => block.trim() !== "")
    .join("\n\n");
}

function renderList(list: TiptapNode, depth: number): string {
  const ordered = typeOf(list) === "orderedList";
  const startAttr = attr(list, "start");
  const start = typeof startAttr === "number" && Number.isFinite(startAttr) ? startAttr : 1;

  return childrenOf(list)
    .map((item, index) => {
      const isTask = typeOf(item) === "taskItem";
      const marker = isTask
        ? `- [${attr(item, "checked") === true ? "x" : " "}] `
        : ordered
          ? `${start + index}. `
          : "- ";

      // Paragraphs of one item are separated by a blank line (or they would read back as line
      // breaks); a nested list follows its text directly.
      const isList = (child: TiptapNode) => /List$/.test(typeOf(child));
      const parts = childrenOf(item)
        .map((child) => ({ list: isList(child), text: renderBlock(child, depth + 1) }))
        .filter((part) => part.text.trim() !== "");
      const body = parts.reduce(
        (all, part, at) => (at === 0 ? part.text : `${all}${part.list || parts[at - 1].list ? "\n" : "\n\n"}${part.text}`),
        ""
      );

      return `${marker}${indentContinuation(body, marker.length)}`.trimEnd();
    })
    .join("\n");
}

function cellText(cell: TiptapNode, depth: number) {
  return childrenOf(cell)
    .map((child) => renderBlock(child, depth + 1))
    .filter((block) => block.trim() !== "")
    .join("<br>")
    .replace(/\n+/g, "<br>")
    .replace(/\|/g, "\\|")
    .trim();
}

function renderTable(table: TiptapNode, depth: number): string {
  const rows = childrenOf(table)
    .filter((row) => typeOf(row) === "tableRow")
    .map((row) => childrenOf(row).map((cell) => cellText(cell, depth)));

  const columns = Math.max(0, ...rows.map((row) => row.length));
  if (rows.length === 0 || columns === 0) {
    return "";
  }

  const line = (cells: string[]) =>
    `| ${Array.from({ length: columns }, (_, index) => cells[index] ?? "").join(" | ")} |`;

  return [line(rows[0]), `| ${Array(columns).fill("---").join(" | ")} |`, ...rows.slice(1).map(line)].join("\n");
}

function renderCodeBlock(node: TiptapNode) {
  const code = childrenOf(node)
    .map((child) => (typeof child.text === "string" ? child.text : ""))
    .join("");
  const longestRun = Math.max(0, ...(code.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  const language = attrString(node, "language");

  return `${fence}${language}\n${code}\n${fence}`;
}

function renderBlock(node: TiptapNode, depth: number): string {
  if (depth > MAX_DEPTH) {
    return "";
  }

  switch (typeOf(node)) {
    case "paragraph":
      return renderInline(childrenOf(node), depth);
    case "heading": {
      const level = Number(attr(node, "level"));
      const hashes = "#".repeat(Number.isInteger(level) ? Math.min(6, Math.max(1, level)) : 2);
      return `${hashes} ${renderInline(childrenOf(node), depth)}`.trimEnd();
    }
    case "bulletList":
    case "orderedList":
    case "taskList":
      return renderList(node, depth);
    case "blockquote":
    case "asideBlock":
      return quote(renderBlocks(childrenOf(node), depth));
    case "codeBlock":
      return renderCodeBlock(node);
    case "horizontalRule":
      return "---";
    case "image":
      return renderImage(node);
    case "youtube": {
      const src = attrString(node, "src");
      return src ? `[YouTube video](${destination(src)})` : "";
    }
    case "table":
      return renderTable(node, depth);
    case "text":
    case "hardBreak":
      return renderInline([node], depth);
    default:
      // Unknown node: render its children as blocks, or as inline text when it holds text.
      return childrenOf(node).some((child) => typeOf(child) === "text")
        ? renderInline(childrenOf(node), depth)
        : renderBlocks(childrenOf(node), depth);
  }
}

/** Markdown for a stored editor document. Returns an empty string for empty or invalid content. */
export function tiptapToMarkdown(content: unknown): string {
  if (!isRecord(content)) {
    return "";
  }

  return renderBlocks(childrenOf(content), 0)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "listItem",
  "taskItem",
  "blockquote",
  "asideBlock",
  "codeBlock",
  "tableRow",
  "horizontalRule"
]);

function plainText(node: TiptapNode, depth: number): string {
  if (depth > MAX_DEPTH) {
    return "";
  }

  const type = typeOf(node);
  if (type === "text") return typeof node.text === "string" ? node.text : "";
  if (type === "hardBreak") return "\n";

  const inner = childrenOf(node).map((child) => plainText(child, depth + 1));
  // A table row reads as "cell | cell": flatten the line breaks inside each cell.
  const text =
    type === "tableRow" ? inner.map((cell) => cell.replace(/\s*\n\s*/g, " ").trim()).join(" | ") : inner.join("");

  return BLOCK_TYPES.has(type) && !text.endsWith("\n") ? `${text}\n` : text;
}

/** Plain text (no Markdown syntax), one block per line. Used for searching and snippets. */
export function tiptapToPlainText(content: unknown): string {
  if (!isRecord(content)) {
    return "";
  }

  return plainText(content, 0).replace(/\n{2,}/g, "\n").trim();
}

/**
 * Lower-cases and strips accents one character at a time, so the result has the same
 * length as the input and match positions can be mapped back to the original text.
 */
export function foldForSearch(text: string): string {
  let folded = "";
  for (const char of text) {
    const simple = char.normalize("NFD").replace(MARKS_RE, "").toLowerCase();
    folded += simple.length === char.length ? simple : char.toLowerCase().length === char.length ? char.toLowerCase() : char;
  }

  return folded;
}
