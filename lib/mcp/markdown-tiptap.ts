// Turns Markdown written by an MCP client into Tiptap JSON blocks, the format stored in
// pages.content / documents.content. It only produces node and mark types that the editor
// defines (see components/editor/rich-editor.tsx) and follows the shapes the editor itself saves.
// Pure and dependency-free. Input it cannot convert safely throws a MarkdownError whose
// message is meant to be shown to the client.

export type JsonMark = { type: string; attrs?: Record<string, unknown> };

export type JsonNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
  text?: string;
  marks?: JsonMark[];
};

export class MarkdownError extends Error {}

export const MAX_MARKDOWN_CHARS = 200_000;

// Nesting of lists and quotes; deeper input is refused rather than risking a stack overflow.
const MAX_NESTING = 10;
// The editor is configured with heading levels 1 to 3.
const MAX_HEADING_LEVEL = 3;

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const HEADING = /^ {0,3}(#{1,6})(?:[ ]+(.*?))?[ ]*$/;
const HR = /^ {0,3}(?:(?:\*[ ]*){3,}|(?:-[ ]*){3,}|(?:_[ ]*){3,})$/;
const QUOTE = /^ {0,3}>/;
const ITEM = /^( *)([-*+]|\d{1,9}[.)])(?:( +)(.*))?$/;
const TASK = /^\[([ xX])\](?:[ ]+(.*))?$/;
const SEPARATOR = /^ {0,3}\|?[ ]*:?-+:?[ ]*(?:\|[ ]*:?-+:?[ ]*)*\|?[ ]*$/;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const INTERNAL_HREF = new RegExp(`^/(?:pages|documents)/${UUID}(?:[/?#].*)?$`, "i");
const PUNCTUATION = /[!-/:-@[-`{-~]/;

const isBlank = (line: string) => line.trim() === "";
const indentOf = (line: string) => line.length - line.trimStart().length;

function stripIndent(line: string, columns: number) {
  let cut = 0;
  while (cut < columns && line[cut] === " ") cut += 1;
  return line.slice(cut);
}

function node(type: string, content?: JsonNode[], attrs?: Record<string, unknown>): JsonNode {
  return {
    type,
    ...(attrs ? { attrs } : {}),
    ...(content && content.length > 0 ? { content } : {})
  };
}

const emptyParagraph = () => node("paragraph");

// ---------------------------------------------------------------------------------------
// Inline content

function textNode(text: string, marks: JsonMark[]): JsonNode {
  return { type: "text", text, ...(marks.length > 0 ? { marks: marks.map((mark) => ({ ...mark })) } : {}) };
}

function withMark(marks: JsonMark[], mark: JsonMark) {
  return marks.some((existing) => existing.type === mark.type) ? marks : [...marks, mark];
}

function backtickRunAt(src: string, at: number) {
  let end = at;
  while (src[end] === "`") end += 1;
  return end - at;
}

/** Index of the closing backtick run of exactly `length` backticks, or -1. */
function findBacktickClose(src: string, from: number, length: number) {
  let index = from;
  while (index < src.length) {
    if (src[index] !== "`") {
      index += 1;
      continue;
    }

    const run = backtickRunAt(src, index);
    if (run === length) return index;
    index += run;
  }

  return -1;
}

function safeHref(destination: string) {
  const href = destination.trim();
  if (INTERNAL_HREF.test(href)) return href;

  if (/^\/(?:pages|documents)\//i.test(href)) {
    throw new MarkdownError(
      `Malformed internal link "${href}". Internal links look like /pages/<uuid> or /documents/<uuid>.`
    );
  }

  // Spaces are tolerated (a stored link may contain one, and Markdown carries it as <url>); line breaks never.
  if (/^https?:\/\/[^\r\n]+$/i.test(href) || /^mailto:[^\r\n]+$/i.test(href) || /^\/(?!\/)[^\r\n]*$/.test(href) || /^#[^\r\n]*$/.test(href)) {
    return href;
  }

  throw new MarkdownError(
    `Unsupported link target "${href}". Use an https:// URL, a mailto: address, or an internal /pages/<uuid> or /documents/<uuid> path.`
  );
}

type LinkSyntax = { label: string; destination: string; title: string | null; end: number };

/** Parses `[label](destination "title")` starting at the `[` at `at`. */
function parseBracketLink(src: string, at: number): LinkSyntax | null {
  let depth = 0;
  let index = at;

  for (; index < src.length; index += 1) {
    const char = src[index];
    if (char === "\\") {
      index += 1;
    } else if (char === "`") {
      const run = backtickRunAt(src, index);
      const close = findBacktickClose(src, index + run, run);
      index = close === -1 ? index + run - 1 : close + run - 1;
    } else if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) break;
    }
  }

  if (index >= src.length || src[index] !== "]" || src[index + 1] !== "(") return null;

  const label = src.slice(at + 1, index);
  let cursor = index + 2;
  while (src[cursor] === " ") cursor += 1;

  let destination: string;
  if (src[cursor] === "<") {
    const close = src.indexOf(">", cursor + 1);
    if (close === -1 || src.slice(cursor + 1, close).includes("\n")) return null;
    destination = src.slice(cursor + 1, close);
    cursor = close + 1;
  } else {
    const start = cursor;
    let parens = 0;
    for (; cursor < src.length; cursor += 1) {
      const char = src[cursor];
      if (char === "\\") {
        cursor += 1;
      } else if (/\s/.test(char)) {
        break;
      } else if (char === "(") {
        parens += 1;
      } else if (char === ")") {
        if (parens === 0) break;
        parens -= 1;
      }
    }
    destination = src.slice(start, cursor).replace(/\\([!-/:-@[-`{-~])/g, "$1");
  }

  while (src[cursor] === " ") cursor += 1;

  let title: string | null = null;
  const opener = src[cursor];
  if (opener === '"' || opener === "'" || opener === "(") {
    const closer = opener === "(" ? ")" : opener;
    const close = src.indexOf(closer, cursor + 1);
    if (close === -1) return null;
    title = src.slice(cursor + 1, close);
    cursor = close + 1;
    while (src[cursor] === " ") cursor += 1;
  }

  if (src[cursor] !== ")") return null;
  return { label, destination, title, end: cursor + 1 };
}

/** Index of the closing delimiter for an emphasis opened just before `from`, or -1. */
function findCloser(src: string, from: number, delimiter: string) {
  const char = delimiter[0];
  let index = from;

  while (index < src.length) {
    const current = src[index];

    if (current === "\\") {
      index += 2;
      continue;
    }

    if (current === "`") {
      const run = backtickRunAt(src, index);
      const close = findBacktickClose(src, index + run, run);
      index = close === -1 ? index + run : close + run;
      continue;
    }

    if (current === char) {
      let run = 0;
      while (src[index + run] === char) run += 1;

      const closes =
        run >= delimiter.length &&
        index > from &&
        !/\s/.test(src[index - 1]) &&
        // `_` never closes inside a word, so snake_case_words stay intact.
        (char !== "_" || !/[\p{L}\p{N}]/u.test(src[index + delimiter.length] ?? ""));

      if (closes && (run === delimiter.length || delimiter.length > 1 || char === "~")) return index;
      // A longer run of a single-character delimiter belongs to a nested stronger emphasis.
      index += run;
      continue;
    }

    index += 1;
  }

  return -1;
}

const EMPHASIS: Record<string, JsonMark[]> = {
  "***": [{ type: "bold" }, { type: "italic" }],
  "**": [{ type: "bold" }],
  "*": [{ type: "italic" }],
  "___": [{ type: "bold" }, { type: "italic" }],
  "__": [{ type: "bold" }],
  "_": [{ type: "italic" }],
  "~~": [{ type: "strike" }]
};

function plainLabel(label: string) {
  return inline(label, [], 0)
    .map((part) => (part.type === "text" ? (part.text ?? "") : ""))
    .join("")
    .trim();
}

function imageNode(syntax: LinkSyntax): JsonNode {
  const source = syntax.destination.trim();

  if (/^data:/i.test(source)) {
    throw new MarkdownError("Embedded (data:) images are not supported. Use an https:// image URL.");
  }

  if (!/^https?:\/\/[^\s]+$/i.test(source)) {
    throw new MarkdownError(`Unsupported image URL "${source}". Images must use an https:// URL.`);
  }

  const alt = plainLabel(syntax.label);
  return { type: "image", attrs: { src: source, alt: alt || null, title: syntax.title || null } };
}

/**
 * Inline nodes for a run of text. `image` nodes may appear in the result: the caller hoists
 * them out of the surrounding text block, because images are block nodes in the editor.
 */
function inline(src: string, marks: JsonMark[], depth: number): JsonNode[] {
  if (depth > MAX_NESTING * 2) return src ? [textNode(src, marks)] : [];

  const out: JsonNode[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) {
      out.push(textNode(buffer, marks));
      buffer = "";
    }
  };
  const hardBreak = () => {
    buffer = buffer.replace(/ +$/, "");
    flush();
    out.push({ type: "hardBreak" });
  };

  let index = 0;
  while (index < src.length) {
    const char = src[index];

    if (char === "\n") {
      hardBreak();
      index += 1;
      while (src[index] === " ") index += 1;
      continue;
    }

    if (char === "\\") {
      const next = src[index + 1];
      if (next === "\n") {
        hardBreak();
        index += 2;
        while (src[index] === " ") index += 1;
      } else if (next !== undefined && PUNCTUATION.test(next)) {
        buffer += next;
        index += 2;
      } else {
        buffer += "\\";
        index += 1;
      }
      continue;
    }

    if (char === "`") {
      const run = backtickRunAt(src, index);
      const close = findBacktickClose(src, index + run, run);
      if (close === -1) {
        buffer += "`".repeat(run);
        index += run;
        continue;
      }

      let code = src.slice(index + run, close).replace(/\n/g, " ");
      if (code.startsWith(" ") && code.endsWith(" ") && code.trim() !== "") code = code.slice(1, -1);
      flush();
      // The editor's code mark excludes every other mark, so it stands alone.
      if (code) out.push({ type: "text", text: code, marks: [{ type: "code" }] });
      index = close + run;
      continue;
    }

    if (char === "!" && src[index + 1] === "[") {
      const syntax = parseBracketLink(src, index + 1);
      if (syntax) {
        flush();
        out.push(imageNode(syntax));
        index = syntax.end;
        continue;
      }
    }

    if (char === "[") {
      const syntax = parseBracketLink(src, index);
      if (syntax) {
        const href = safeHref(syntax.destination);
        flush();
        const inLink = marks.some((mark) => mark.type === "link");
        out.push(...inline(syntax.label, inLink ? marks : withMark(marks, { type: "link", attrs: { href } }), depth + 1));
        index = syntax.end;
        continue;
      }
    }

    if (char === "<") {
      const rest = src.slice(index);
      const auto = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i.exec(rest);
      if (auto) {
        flush();
        out.push(textNode(auto[1], withMark(marks, { type: "link", attrs: { href: safeHref(auto[1]) } })));
        index += auto[0].length;
        continue;
      }

      const lineBreak = /^<br\s*\/?>/i.exec(rest);
      if (lineBreak) {
        hardBreak();
        index += lineBreak[0].length;
        continue;
      }
    }

    if (char === "*" || char === "_" || char === "~") {
      let run = 0;
      while (src[index + run] === char) run += 1;

      const length = char === "~" ? (run >= 2 ? 2 : 0) : Math.min(run, 3);
      const delimiter = char.repeat(length);
      const before = src[index - 1] ?? "";
      const after = src[index + run] ?? "";
      const opens =
        length > 0 &&
        after !== "" &&
        !/\s/.test(after) &&
        (char !== "_" || !/[\p{L}\p{N}]/u.test(before));

      if (opens) {
        const close = findCloser(src, index + length, delimiter);
        if (close !== -1) {
          const added = EMPHASIS[delimiter];
          const inner = src.slice(index + length, close);
          flush();
          out.push(...inline(inner, added.reduce((all, mark) => withMark(all, mark), marks), depth + 1));
          index = close + length;
          continue;
        }
      }

      buffer += char.repeat(run);
      index += run;
      continue;
    }

    buffer += char;
    index += 1;
  }

  flush();
  return out;
}

function trimBreaks(nodes: JsonNode[]) {
  let start = 0;
  let end = nodes.length;
  while (start < end && nodes[start].type === "hardBreak") start += 1;
  while (end > start && nodes[end - 1].type === "hardBreak") end -= 1;
  return nodes.slice(start, end);
}

/** Splits inline nodes into text blocks, moving images out as their own blocks. */
function textBlocks(inlineNodes: JsonNode[], make: (content: JsonNode[]) => JsonNode): JsonNode[] {
  const blocks: JsonNode[] = [];
  let run: JsonNode[] = [];
  const flush = () => {
    const content = trimBreaks(run);
    if (content.length > 0) blocks.push(make(content));
    run = [];
  };

  for (const item of inlineNodes) {
    if (item.type === "image") {
      flush();
      blocks.push(item);
    } else {
      run.push(item);
    }
  }

  flush();
  return blocks;
}

const paragraphOf = (text: string) => textBlocks(inline(text, [], 0), (content) => node("paragraph", content));

// ---------------------------------------------------------------------------------------
// Blocks

function validFence(line: string) {
  const match = FENCE.exec(line);
  // An info string may not contain backticks after a backtick fence: that is inline code.
  return Boolean(match && !(match[1][0] === "`" && match[2].includes("`")));
}

function splitRow(line: string) {
  let text = line.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|") && !text.endsWith("\\|")) text = text.slice(0, -1);

  const cells: string[] = [];
  let cell = "";
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\\" && text[index + 1] === "|") {
      cell += "|";
      index += 1;
    } else if (text[index] === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += text[index];
    }
  }
  cells.push(cell.trim());
  return cells;
}

function isTableStart(lines: string[], at: number) {
  const header = lines[at];
  const separator = lines[at + 1];
  if (separator === undefined || !SEPARATOR.test(separator)) return false;
  if (!header.includes("|") && !separator.includes("|")) return false;
  return splitRow(header).length === splitRow(separator).length;
}

function startsBlock(lines: string[], at: number) {
  const line = lines[at];
  if (validFence(line) || HEADING.test(line) || HR.test(line) || QUOTE.test(line) || isTableStart(lines, at)) {
    return true;
  }

  const item = ITEM.exec(line);
  if (!item || (item[4] ?? "").trim() === "") return false;
  // Like CommonMark, an ordered list can only interrupt a paragraph when it starts at 1.
  return !/^\d/.test(item[2]) || parseInt(item[2], 10) === 1;
}

function cellBlocks(text: string) {
  const blocks = text
    .split(/<br\s*\/?>/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => paragraphOf(part));
  return blocks.length > 0 ? blocks : [emptyParagraph()];
}

function parseTable(lines: string[], start: number) {
  const header = splitRow(lines[start]);
  const rows: string[][] = [header];
  let index = start + 2;

  while (index < lines.length && !isBlank(lines[index]) && !startsBlock(lines, index)) {
    rows.push(splitRow(lines[index]));
    index += 1;
  }

  const width = Math.max(...rows.map((row) => row.length));
  const table = node(
    "table",
    rows.map((row, rowIndex) =>
      node(
        "tableRow",
        Array.from({ length: width }, (_, column) =>
          node(rowIndex === 0 ? "tableHeader" : "tableCell", cellBlocks(row[column] ?? ""))
        )
      )
    )
  );
  return { block: table, next: index };
}

function parseFence(lines: string[], start: number) {
  const match = FENCE.exec(lines[start]) as RegExpExecArray;
  const marker = match[1];
  const indent = indentOf(lines[start]);
  const language = match[2].trim().split(/\s+/)[0] || null;
  const code: string[] = [];
  let index = start + 1;

  while (index < lines.length) {
    const closing = /^ {0,3}(`{3,}|~{3,})[ ]*$/.exec(lines[index]);
    if (closing && closing[1][0] === marker[0] && closing[1].length >= marker.length) {
      index += 1;
      break;
    }
    code.push(stripIndent(lines[index], indent));
    index += 1;
  }

  const text = code.join("\n");
  return {
    block: node("codeBlock", text ? [{ type: "text", text }] : undefined, { language }),
    next: index
  };
}

function listKind(item: RegExpExecArray): "bullet" | "ordered" | "task" {
  if (/^\d/.test(item[2])) return "ordered";
  return TASK.test(item[4] ?? "") ? "task" : "bullet";
}

/** A list item's first block must be a paragraph in the editor's schema. */
function itemContent(blocks: JsonNode[]) {
  if (blocks.length === 0) return [emptyParagraph()];
  return blocks[0].type === "paragraph" ? blocks : [emptyParagraph(), ...blocks];
}

function parseList(lines: string[], start: number, depth: number) {
  const first = ITEM.exec(lines[start]) as RegExpExecArray;
  const baseIndent = first[1].length;
  const kind = listKind(first);
  const startNumber = kind === "ordered" ? parseInt(first[2], 10) : 1;
  const items: JsonNode[] = [];
  let index = start;

  for (;;) {
    const match = ITEM.exec(lines[index]) as RegExpExecArray;
    const itemIndent = match[1].length;
    const spaces = match[3]?.length ?? 0;
    const rest = match[4] ?? "";
    const contentIndent = itemIndent + match[2].length + (rest !== "" && spaces >= 1 && spaces <= 4 ? spaces : 1);

    let checked: boolean | null = null;
    let firstLine = rest;
    if (kind === "task") {
      const task = TASK.exec(rest);
      if (task) {
        checked = task[1] !== " ";
        firstLine = task[2] ?? "";
      }
    }

    const itemLines = [firstLine];
    index += 1;

    while (index < lines.length) {
      const line = lines[index];

      if (isBlank(line)) {
        let ahead = index + 1;
        while (ahead < lines.length && isBlank(lines[ahead])) ahead += 1;
        if (ahead >= lines.length) {
          index = ahead;
          break;
        }

        const following = lines[ahead];
        const nested = indentOf(following) >= itemIndent + 2 || (indentOf(following) > itemIndent && !ITEM.test(following));
        if (!nested) {
          index = ahead;
          break;
        }

        for (let blank = index; blank < ahead; blank += 1) itemLines.push("");
        index = ahead;
        continue;
      }

      const indent = indentOf(line);
      const isSiblingItem = ITEM.test(line) && indent < itemIndent + 2;
      if (indent > itemIndent && !isSiblingItem) {
        itemLines.push(stripIndent(line, Math.min(indent, contentIndent)));
        index += 1;
        continue;
      }
      break;
    }

    const blocks = parseBlocks(itemLines, depth + 1);
    items.push(
      kind === "task"
        ? node("taskItem", itemContent(blocks), { checked: checked === true })
        : node("listItem", itemContent(blocks))
    );

    if (index >= lines.length) break;
    const next = ITEM.exec(lines[index]);
    if (!next) break;
    const nextIndent = next[1].length;
    if (nextIndent < baseIndent || nextIndent >= itemIndent + 2 || listKind(next) !== kind) break;
  }

  const type = kind === "ordered" ? "orderedList" : kind === "task" ? "taskList" : "bulletList";
  return { block: node(type, items, kind === "ordered" ? { start: startNumber } : undefined), next: index };
}

function parseBlocks(lines: string[], depth: number): JsonNode[] {
  if (depth > MAX_NESTING) {
    throw new MarkdownError("The Markdown is nested too deeply (lists or quotes inside each other).");
  }

  const blocks: JsonNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (isBlank(line)) {
      index += 1;
      continue;
    }

    if (validFence(line)) {
      const parsed = parseFence(lines, index);
      blocks.push(parsed.block);
      index = parsed.next;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length, MAX_HEADING_LEVEL);
      const text = (heading[2] ?? "").replace(/(?:^|[ ]+)#+$/, "").trim();
      const made = textBlocks(inline(text, [], 0), (content) => node("heading", content, { level }));
      blocks.push(...(made.length > 0 ? made : [node("heading", undefined, { level })]));
      index += 1;
      continue;
    }

    if (HR.test(line)) {
      blocks.push(node("horizontalRule"));
      index += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (index < lines.length && QUOTE.test(lines[index])) {
        inner.push(lines[index].replace(/^ {0,3}> ?/, ""));
        index += 1;
      }
      const content = parseBlocks(inner, depth + 1);
      blocks.push(node("blockquote", content.length > 0 ? content : [emptyParagraph()]));
      continue;
    }

    if (isTableStart(lines, index)) {
      const parsed = parseTable(lines, index);
      blocks.push(parsed.block);
      index = parsed.next;
      continue;
    }

    if (ITEM.test(line)) {
      const parsed = parseList(lines, index, depth);
      blocks.push(parsed.block);
      index = parsed.next;
      continue;
    }

    const paragraph: string[] = [line.trimStart()];
    index += 1;
    while (index < lines.length && !isBlank(lines[index]) && !startsBlock(lines, index)) {
      paragraph.push(lines[index].trimStart());
      index += 1;
    }
    blocks.push(...paragraphOf(paragraph.join("\n")));
  }

  return blocks;
}

/**
 * Editor blocks for a Markdown string (CommonMark plus tables, task lists and strikethrough).
 * A single line break inside a paragraph becomes a line break. Returns [] for blank input.
 */
export function markdownToTiptap(markdown: string): JsonNode[] {
  if (markdown.length > MAX_MARKDOWN_CHARS) {
    throw new MarkdownError(`The Markdown is too long (limit ${MAX_MARKDOWN_CHARS} characters).`);
  }

  const lines = markdown
    .replace(/\r\n?/g, "\n")
    .split("\n")
    // Leading tabs count as four spaces; tabs elsewhere are kept.
    .map((line) => line.replace(/^[ \t]+/, (space) => space.replace(/\t/g, "    ")));

  return parseBlocks(lines, 0);
}
