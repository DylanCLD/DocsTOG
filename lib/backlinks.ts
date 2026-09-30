import type { SupabaseClient } from "@supabase/supabase-js";

// Backlinks ("links to this page") are computed on read from the stored editor
// content: pages.content / documents.content stay the single source of truth and
// nothing is written. Internal links are Tiptap `link` marks whose href is
// `/pages/<uuid>` or `/documents/<uuid>` (see applyInternalLink in the editor).

export type BacklinkTarget = { type: "page" | "document"; id: string };

export type Backlink = {
  type: "page" | "document";
  id: string;
  title: string;
  icon: string | null;
  /** Manager name for a document. */
  context: string | null;
  href: string;
  /** Distinct, non-empty texts of the links pointing at the target. */
  labels: string[];
  /** Number of links pointing at the target inside this source. */
  count: number;
};

export type BacklinksResult = {
  items: Backlink[];
  /** True when a query failed or hit the row cap: the list may miss some sources. */
  incomplete: boolean;
};

type ServerSupabase = SupabaseClient;

type ManagerJoin = { name: string | null };
type PageRow = { id: string; title: string; icon: string | null; content: unknown };
type DocumentRow = {
  id: string;
  title: string;
  content: unknown;
  document_managers: ManagerJoin | ManagerJoin[] | null;
};

type JsonNode = {
  text?: unknown;
  marks?: unknown;
  content?: unknown;
};

// Supabase caps a response at 1000 rows by default; beyond that we flag the result.
const ROW_LIMIT = 1000;
const MAX_DEPTH = 100;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const INTERNAL_PATH = new RegExp(`^/(pages|documents)/(${UUID})/?$`, "i");

/**
 * Reads `/pages/<id>` or `/documents/<id>` out of a link href.
 * Accepts relative hrefs (query and hash ignored) and absolute URLs on any origin,
 * since a pasted link to the site's own address is still an internal link.
 */
export function parseInternalHref(href: unknown): BacklinkTarget | null {
  if (typeof href !== "string") {
    return null;
  }

  const raw = href.trim();
  if (!raw) {
    return null;
  }

  let path: string;
  if (raw.startsWith("/")) {
    path = raw.split(/[?#]/, 1)[0];
  } else {
    try {
      path = new URL(raw).pathname;
    } catch {
      return null;
    }
  }

  const match = INTERNAL_PATH.exec(path);
  if (!match) {
    return null;
  }

  return { type: match[1].toLowerCase() === "pages" ? "page" : "document", id: match[2].toLowerCase() };
}

function linksToTarget(node: unknown, target: BacklinkTarget) {
  const marks = (node as JsonNode | null)?.marks;
  if (!Array.isArray(marks)) {
    return false;
  }

  return marks.some((mark) => {
    if (!mark || typeof mark !== "object" || (mark as { type?: unknown }).type !== "link") {
      return false;
    }

    const parsed = parseInternalHref((mark as { attrs?: { href?: unknown } }).attrs?.href);
    return parsed?.type === target.type && parsed.id === target.id.toLowerCase();
  });
}

/**
 * One entry per link to `target` found in a Tiptap JSON document, holding the
 * link text (may be empty). Adjacent text nodes carrying the same link, such as
 * a bold word inside a link, are merged into one entry.
 */
export function collectLinkLabels(content: unknown, target: BacklinkTarget): string[] {
  const labels: string[] = [];
  const seen = new WeakSet<object>();

  const visit = (node: unknown, depth: number) => {
    if (depth > MAX_DEPTH || !node || typeof node !== "object" || seen.has(node)) {
      return;
    }

    seen.add(node);
    const children = (node as JsonNode).content;
    if (!Array.isArray(children)) {
      return;
    }

    let run: string | null = null;
    for (const child of children) {
      if (linksToTarget(child, target)) {
        const text = (child as JsonNode).text;
        run = (run ?? "") + (typeof text === "string" ? text : "");
        continue;
      }

      if (run !== null) {
        labels.push(run.trim());
        run = null;
      }

      visit(child, depth + 1);
    }

    if (run !== null) {
      labels.push(run.trim());
    }
  };

  visit(content, 0);
  return labels;
}

function toBacklink(
  source: { type: "page" | "document"; id: string; title: string; icon: string | null; context: string | null; content: unknown },
  target: BacklinkTarget
): Backlink | null {
  if (source.type === target.type && source.id === target.id) {
    return null;
  }

  const labels = collectLinkLabels(source.content, target);
  if (labels.length === 0) {
    return null;
  }

  return {
    type: source.type,
    id: source.id,
    title: source.title,
    icon: source.icon,
    context: source.context,
    href: source.type === "page" ? `/pages/${source.id}` : `/documents/${source.id}`,
    labels: Array.from(new Set(labels.filter(Boolean))),
    count: labels.length
  };
}

/**
 * Pages and documents whose content links to `target`.
 * Read-only. Never throws: a failure is reported through `incomplete`.
 *
 * The scan runs here rather than in SQL because PostgREST rejects casts in
 * filters (`content::text.ilike…`) and a SQL function would need a migration.
 * If the content volume grows, a function/view can replace the two queries.
 */
export async function fetchBacklinks(supabase: ServerSupabase, target: BacklinkTarget): Promise<BacklinksResult> {
  try {
    const [pagesResult, documentsResult] = await Promise.all([
      supabase.from("pages").select("id,title,icon,content").limit(ROW_LIMIT),
      supabase.from("documents").select("id,title,content,document_managers(name)").limit(ROW_LIMIT)
    ]);

    const pages = (pagesResult.data ?? []) as PageRow[];
    const documents = (documentsResult.data ?? []) as DocumentRow[];
    const incomplete =
      Boolean(pagesResult.error) ||
      Boolean(documentsResult.error) ||
      pages.length >= ROW_LIMIT ||
      documents.length >= ROW_LIMIT;

    const fromPages = pages.flatMap((page) => {
      const backlink = toBacklink(
        { type: "page", id: page.id, title: page.title, icon: page.icon, context: null, content: page.content },
        target
      );
      return backlink ? [backlink] : [];
    });

    const fromDocuments = documents.flatMap((document) => {
      const manager = Array.isArray(document.document_managers) ? document.document_managers[0] : document.document_managers;
      const backlink = toBacklink(
        { type: "document", id: document.id, title: document.title, icon: null, context: manager?.name ?? null, content: document.content },
        target
      );
      return backlink ? [backlink] : [];
    });

    const byTitle = (a: Backlink, b: Backlink) => a.title.localeCompare(b.title, "fr", { sensitivity: "base" });
    return { items: [...fromPages.sort(byTitle), ...fromDocuments.sort(byTitle)], incomplete };
  } catch (error) {
    console.error("[fetchBacklinks] failed", { target, error: String(error) });
    return { items: [], incomplete: true };
  }
}
