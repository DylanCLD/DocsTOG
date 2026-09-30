import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { fetchBacklinks } from "@/lib/backlinks";
import { collectAncestors } from "@/lib/hierarchy";
import type { JsonSchemaObject, ToolDefinition, ToolResult } from "@/lib/mcp/protocol";
import { foldForSearch, tiptapToMarkdown, tiptapToPlainText } from "@/lib/mcp/tiptap-markdown";

// Every tool here is read-only: only SELECT queries are issued, always through the
// service-role client, so nothing may be added that writes without a deliberate review.

// Supabase returns at most 1000 rows per request; results built from a full read say so.
const ROW_LIMIT = 1000;
const DEFAULT_MAX_CHARS = 50_000;
const MAX_CHARS_CAP = 200_000;

const STATUSES = ["todo", "in_progress", "review", "done"] as const;
const PRIORITIES = ["low", "medium", "high", "critical"] as const;

type Query = PromiseLike<{ data: unknown; error: { message: string } | null }>;

async function rows<T>(query: Query): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? (data as T[]) : [];
}

function text(value: string): ToolResult {
  return { content: [{ type: "text", text: value }] };
}

function json(value: unknown): ToolResult {
  return text(JSON.stringify(value));
}

function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

function parseArguments<S extends z.ZodTypeAny>(
  schema: S,
  args: unknown
): { ok: true; data: z.infer<S> } | { ok: false; result: ToolResult } {
  const parsed = schema.safeParse(args ?? {});
  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }

  const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "arguments"}: ${issue.message}`);
  return { ok: false, result: fail(`Invalid arguments. ${issues.join("; ")}`) };
}

function limitText(value: string, max: number) {
  if (value.length <= max) {
    return value;
  }

  let end = value.lastIndexOf("\n", max);
  if (end < max * 0.6) {
    end = max;
  }

  // Do not cut a surrogate pair in half.
  const last = value.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) {
    end -= 1;
  }

  return `${value.slice(0, end)}\n\n[truncated: ${value.length - end} more characters. Call again with a larger max_chars (up to ${MAX_CHARS_CAP}).]`;
}

function renderBody(content: unknown, format: "markdown" | "json", maxChars: number) {
  const body = format === "json" ? JSON.stringify(content ?? null) : tiptapToMarkdown(content);
  return limitText(body || "(empty)", maxChars);
}

// ---------------------------------------------------------------------------------------
// Rows

type PageListRow = {
  id: string;
  parent_page_id: string | null;
  title: string;
  icon: string | null;
  category: string | null;
  is_favorite: boolean | null;
  updated_at: string;
};

type PageTreeRow = { id: string; parent_page_id: string | null; title: string; icon: string | null };

type PageDetailRow = PageListRow & { created_at: string; content: unknown };

type DocumentListRow = {
  id: string;
  manager_id: string;
  parent_document_id: string | null;
  title: string;
  short_description: string | null;
  status: string;
  priority: string;
  responsible_id: string | null;
  is_favorite: boolean | null;
  updated_at: string;
};

type DocumentTreeRow = { id: string; parent_document_id: string | null; title: string };

type DocumentDetailRow = DocumentListRow & { created_at: string; content: unknown };

type ManagerRow = { id: string; name: string; icon: string | null; description: string | null };
type UserRow = { id: string; full_name: string | null; email: string | null };
type TagRow = { id: string; name: string };
type DocumentTagRow = { document_id: string; tag_id: string };

const PAGE_LIST_COLUMNS = "id,parent_page_id,title,icon,category,is_favorite,updated_at";
const DOCUMENT_LIST_COLUMNS =
  "id,manager_id,parent_document_id,title,short_description,status,priority,responsible_id,is_favorite,updated_at";

// ---------------------------------------------------------------------------------------
// Inputs (each JSON Schema below must describe the same fields as its zod schema)

const uuid = z.string().uuid();
const maxChars = z.number().int().min(1000).max(MAX_CHARS_CAP).default(DEFAULT_MAX_CHARS);
const format = z.enum(["markdown", "json"]).default("markdown");

const searchInput = z
  .object({
    query: z.string().trim().min(2).max(200),
    types: z.array(z.enum(["page", "document"])).min(1).optional(),
    scope: z.enum(["titles", "content"]).default("titles"),
    limit: z.number().int().min(1).max(25).default(10)
  })
  .strict();

const listPagesInput = z
  .object({
    parent_id: z.union([z.literal("root"), uuid]).optional(),
    limit: z.number().int().min(1).max(500).default(200)
  })
  .strict();

const getPageInput = z.object({ id: uuid, format, max_chars: maxChars }).strict();

const listManagersInput = z.object({}).strict();

const listDocumentsInput = z
  .object({
    manager_id: uuid.optional(),
    parent_id: z.union([z.literal("root"), uuid]).optional(),
    status: z.enum(STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    tag: z.string().trim().min(1).max(80).optional(),
    limit: z.number().int().min(1).max(500).default(200)
  })
  .strict();

const getDocumentInput = z.object({ id: uuid, format, max_chars: maxChars }).strict();

const getBacklinksInput = z.object({ type: z.enum(["page", "document"]), id: uuid }).strict();

const idProperty = (what: string) => ({ type: "string", format: "uuid", description: `UUID of the ${what}.` });
const formatProperty = {
  type: "string",
  enum: ["markdown", "json"],
  default: "markdown",
  description: "'markdown' (default) is easiest to read. 'json' returns the raw editor document."
};
const maxCharsProperty = {
  type: "integer",
  minimum: 1000,
  maximum: MAX_CHARS_CAP,
  default: DEFAULT_MAX_CHARS,
  description: "Maximum number of characters of content to return. Longer content is truncated with a notice."
};
const limitProperty = (max: number, fallback: number) => ({
  type: "integer",
  minimum: 1,
  maximum: max,
  default: fallback,
  description: "Maximum number of results."
});

function schema(properties: JsonSchemaObject["properties"], required: string[] = []): JsonSchemaObject {
  return { type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false };
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

// ---------------------------------------------------------------------------------------
// Helpers shared by the tools

async function userNames(supabase: SupabaseClient) {
  const users = await rows<UserRow>(supabase.from("users").select("id,full_name,email").limit(ROW_LIMIT));
  return new Map(users.map((user) => [user.id, user.full_name || user.email || "Unknown"]));
}

async function managerMap(supabase: SupabaseClient) {
  const managers = await rows<ManagerRow>(
    supabase.from("document_managers").select("id,name,icon,description").order("name", { ascending: true }).limit(ROW_LIMIT)
  );
  return { managers, byId: new Map(managers.map((manager) => [manager.id, manager])) };
}

async function tagsByDocument(supabase: SupabaseClient) {
  const [links, tags] = await Promise.all([
    rows<DocumentTagRow>(supabase.from("document_tags").select("document_id,tag_id").limit(ROW_LIMIT)),
    rows<TagRow>(supabase.from("tags").select("id,name").limit(ROW_LIMIT))
  ]);
  const names = new Map(tags.map((tag) => [tag.id, tag.name]));
  const byDocument = new Map<string, string[]>();

  for (const link of links) {
    const name = names.get(link.tag_id);
    if (name) {
      byDocument.set(link.document_id, [...(byDocument.get(link.document_id) ?? []), name]);
    }
  }

  return byDocument;
}

function snippetAround(original: string, folded: string, needle: string) {
  const at = folded.indexOf(needle);
  if (at < 0) {
    return { count: 0, snippet: "" };
  }

  let count = 0;
  for (let from = at; from >= 0 && count < 50; from = folded.indexOf(needle, from + needle.length)) {
    count += 1;
  }

  const start = Math.max(0, at - 80);
  const end = Math.min(original.length, at + needle.length + 140);
  const snippet = original.slice(start, end).replace(/\s+/g, " ").trim();
  return { count, snippet: `${start > 0 ? "… " : ""}${snippet}${end < original.length ? " …" : ""}` };
}

// ---------------------------------------------------------------------------------------
// Tools

export function createTools(getClient: () => SupabaseClient): ToolDefinition[] {
  const search: ToolDefinition = {
    name: "search",
    title: "Search pages and documents",
    description:
      "Find pages and documents by text. Accents and case are ignored. scope 'titles' (default, fast) looks in titles plus the category of pages and the short description of documents. scope 'content' also searches inside the body text and returns a snippet around the match (slower: it reads every page and document). Use get_page / get_document to read a result.",
    inputSchema: schema(
      {
        query: { type: "string", minLength: 2, maxLength: 200, description: "Text to look for (at least 2 characters)." },
        types: {
          type: "array",
          items: { type: "string", enum: ["page", "document"] },
          minItems: 1,
          description: "Restrict to pages and/or documents. Both by default."
        },
        scope: { type: "string", enum: ["titles", "content"], default: "titles", description: "Where to search." },
        limit: limitProperty(25, 10)
      },
      ["query"]
    ),
    annotations: READ_ONLY,
    run: async (args) => {
      const parsed = parseArguments(searchInput, args);
      if (!parsed.ok) return parsed.result;

      const { query, types, scope, limit } = parsed.data;
      const supabase = getClient();
      const needle = foldForSearch(query);
      const inContent = scope === "content";
      const wantPages = !types || types.includes("page");
      const wantDocuments = !types || types.includes("document");

      const pageColumns = `id,title,icon,category,updated_at${inContent ? ",content" : ""}`;
      const documentColumns = `id,title,short_description,manager_id,status,updated_at${inContent ? ",content" : ""}`;

      const [pages, documents, managers] = await Promise.all([
        wantPages
          ? rows<Record<string, unknown>>(supabase.from("pages").select(pageColumns).limit(ROW_LIMIT))
          : Promise.resolve([]),
        wantDocuments
          ? rows<Record<string, unknown>>(supabase.from("documents").select(documentColumns).limit(ROW_LIMIT))
          : Promise.resolve([]),
        wantDocuments ? managerMap(supabase) : Promise.resolve(null)
      ]);

      type Hit = {
        type: "page" | "document";
        id: string;
        title: string;
        icon?: string;
        in: string | null;
        matched_in: string[];
        snippet?: string;
        updated_at: string;
      };
      const hits: Array<{ hit: Hit; score: number }> = [];

      const consider = (
        type: "page" | "document",
        row: Record<string, unknown>,
        meta: string | null,
        place: string | null,
        metaLabel: string
      ) => {
        const title = String(row.title ?? "");
        const matchedIn: string[] = [];
        let score = 0;
        let snippet: string | undefined;

        if (foldForSearch(title).includes(needle)) {
          matchedIn.push("title");
          score += 100;
        }

        if (meta && foldForSearch(meta).includes(needle)) {
          matchedIn.push(metaLabel);
          score += 10;
        }

        if (inContent) {
          const plain = tiptapToPlainText(row.content);
          const found = snippetAround(plain, foldForSearch(plain), needle);
          if (found.count > 0) {
            matchedIn.push("content");
            score += Math.min(found.count, 20);
            snippet = found.snippet;
          }
        }

        if (score > 0) {
          hits.push({
            score,
            hit: {
              type,
              id: String(row.id),
              title,
              ...(type === "page" && typeof row.icon === "string" ? { icon: row.icon } : {}),
              in: place,
              matched_in: matchedIn,
              ...(snippet ? { snippet } : {}),
              updated_at: String(row.updated_at ?? "")
            }
          });
        }
      };

      for (const page of pages) {
        consider("page", page, typeof page.category === "string" ? page.category : null, "Pages", "category");
      }

      for (const document of documents) {
        const manager = managers?.byId.get(String(document.manager_id));
        consider(
          "document",
          document,
          typeof document.short_description === "string" ? document.short_description : null,
          manager?.name ?? null,
          "description"
        );
      }

      hits.sort((a, b) => b.score - a.score || b.hit.updated_at.localeCompare(a.hit.updated_at));

      return json({
        query,
        scope,
        total_matches: hits.length,
        returned: Math.min(hits.length, limit),
        source_truncated: pages.length >= ROW_LIMIT || documents.length >= ROW_LIMIT,
        results: hits.slice(0, limit).map(({ hit }) => hit)
      });
    }
  };

  const listPages: ToolDefinition = {
    name: "list_pages",
    title: "List pages",
    description:
      "List pages (free-form documentation organised as a tree). Without parent_id every page is returned with its parent_id, so the tree can be rebuilt. Pass parent_id 'root' for top-level pages, or a page id for its direct children.",
    inputSchema: schema({
      parent_id: {
        type: "string",
        description: "'root' for top-level pages, or the UUID of a page to list its direct children."
      },
      limit: limitProperty(500, 200)
    }),
    annotations: READ_ONLY,
    run: async (args) => {
      const parsed = parseArguments(listPagesInput, args);
      if (!parsed.ok) return parsed.result;

      const { parent_id: parentId, limit } = parsed.data;
      const pages = await rows<PageListRow>(
        getClient()
          .from("pages")
          .select(PAGE_LIST_COLUMNS)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true })
          .limit(ROW_LIMIT)
      );

      const withChildren = new Set(pages.map((page) => page.parent_page_id).filter(Boolean));
      const selected =
        parentId === "root"
          ? pages.filter((page) => !page.parent_page_id)
          : parentId
            ? pages.filter((page) => page.parent_page_id === parentId)
            : pages;

      return json({
        total: selected.length,
        returned: Math.min(selected.length, limit),
        source_truncated: pages.length >= ROW_LIMIT,
        pages: selected.slice(0, limit).map((page) => ({
          id: page.id,
          title: page.title,
          icon: page.icon,
          category: page.category,
          parent_id: page.parent_page_id,
          has_children: withChildren.has(page.id),
          pinned: page.is_favorite === true,
          updated_at: page.updated_at
        }))
      });
    }
  };

  const getPage: ToolDefinition = {
    name: "get_page",
    title: "Read a page",
    description:
      "Read one page: its metadata, its position in the tree, its sub-pages and its content as Markdown. Internal links in the content look like /pages/<id> or /documents/<id>.",
    inputSchema: schema({ id: idProperty("page"), format: formatProperty, max_chars: maxCharsProperty }, ["id"]),
    annotations: READ_ONLY,
    run: async (args) => {
      const parsed = parseArguments(getPageInput, args);
      if (!parsed.ok) return parsed.result;

      const { id, format: outputFormat, max_chars: limit } = parsed.data;
      const supabase = getClient();
      const [found, tree] = await Promise.all([
        rows<PageDetailRow>(
          supabase.from("pages").select(`${PAGE_LIST_COLUMNS},created_at,content`).eq("id", id).limit(1)
        ),
        rows<PageTreeRow>(
          supabase
            .from("pages")
            .select("id,parent_page_id,title,icon")
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true })
            .limit(ROW_LIMIT)
        )
      ]);

      const page = found[0];
      if (!page) return fail(`No page with id ${id}.`);

      const ancestors = collectAncestors(tree, page.id, (item) => item.parent_page_id);
      const children = tree.filter((item) => item.parent_page_id === page.id);
      const header = [
        `# ${[page.icon, page.title].filter(Boolean).join(" ")}`,
        `- type: page`,
        `- id: ${page.id}`,
        `- category: ${page.category ?? ""}`,
        `- path: ${["Pages", ...ancestors.map((ancestor) => ancestor.title), page.title].join(" > ")}`,
        ...(page.is_favorite ? ["- pinned: yes"] : []),
        `- created: ${page.created_at}`,
        `- updated: ${page.updated_at}`,
        ...(children.length
          ? [`- sub-pages:`, ...children.map((child) => `  - ${child.title} (id: ${child.id})`)]
          : [])
      ].join("\n");

      return text(`${header}\n\n---\n\n${renderBody(page.content, outputFormat, limit)}`);
    }
  };

  const listManagers: ToolDefinition = {
    name: "list_managers",
    title: "List document managers",
    description:
      "List the document managers (top-level groups of documents, such as 'Système' or 'Budget') with the number of documents in each.",
    inputSchema: schema({}),
    annotations: READ_ONLY,
    run: async (args) => {
      const parsed = parseArguments(listManagersInput, args);
      if (!parsed.ok) return parsed.result;

      const supabase = getClient();
      const [{ managers }, documents] = await Promise.all([
        managerMap(supabase),
        rows<{ manager_id: string }>(supabase.from("documents").select("manager_id").limit(ROW_LIMIT))
      ]);

      const counts = new Map<string, number>();
      for (const document of documents) {
        counts.set(document.manager_id, (counts.get(document.manager_id) ?? 0) + 1);
      }

      return json({
        managers: managers.map((manager) => ({
          id: manager.id,
          name: manager.name,
          icon: manager.icon,
          description: manager.description,
          document_count: counts.get(manager.id) ?? 0
        }))
      });
    }
  };

  const listDocuments: ToolDefinition = {
    name: "list_documents",
    title: "List documents",
    description:
      "List documents with their metadata (manager, status, priority, responsible person, tags). All filters are optional and combine. Documents can be nested: use parent_id 'root' for top-level documents, or a document id for its direct children.",
    inputSchema: schema({
      manager_id: idProperty("document manager"),
      parent_id: {
        type: "string",
        description: "'root' for top-level documents, or the UUID of a document to list its direct children."
      },
      status: { type: "string", enum: [...STATUSES], description: "Only documents with this status." },
      priority: { type: "string", enum: [...PRIORITIES], description: "Only documents with this priority." },
      tag: { type: "string", minLength: 1, maxLength: 80, description: "Only documents carrying this tag (case-insensitive)." },
      limit: limitProperty(500, 200)
    }),
    annotations: READ_ONLY,
    run: async (args) => {
      const parsed = parseArguments(listDocumentsInput, args);
      if (!parsed.ok) return parsed.result;

      const { manager_id: managerId, parent_id: parentId, status, priority, tag, limit } = parsed.data;
      const supabase = getClient();

      let query = supabase.from("documents").select(DOCUMENT_LIST_COLUMNS);
      if (managerId) query = query.eq("manager_id", managerId);
      if (status) query = query.eq("status", status);
      if (priority) query = query.eq("priority", priority);

      const [documents, { byId: managers }, users, tags] = await Promise.all([
        rows<DocumentListRow>(
          query.order("sort_order", { ascending: true }).order("created_at", { ascending: true }).limit(ROW_LIMIT)
        ),
        managerMap(supabase),
        userNames(supabase),
        tagsByDocument(supabase)
      ]);

      const wantedTag = tag?.toLowerCase();
      const withChildren = new Set(documents.map((document) => document.parent_document_id).filter(Boolean));
      const selected = documents
        .filter((document) =>
          parentId === "root"
            ? !document.parent_document_id
            : parentId
              ? document.parent_document_id === parentId
              : true
        )
        .filter((document) => !wantedTag || (tags.get(document.id) ?? []).some((name) => name.toLowerCase() === wantedTag));

      return json({
        total: selected.length,
        returned: Math.min(selected.length, limit),
        source_truncated: documents.length >= ROW_LIMIT,
        documents: selected.slice(0, limit).map((document) => ({
          id: document.id,
          title: document.title,
          description: document.short_description,
          manager: managers.get(document.manager_id)?.name ?? null,
          manager_id: document.manager_id,
          parent_id: document.parent_document_id,
          has_children: withChildren.has(document.id),
          status: document.status,
          priority: document.priority,
          responsible: document.responsible_id ? (users.get(document.responsible_id) ?? null) : null,
          tags: tags.get(document.id) ?? [],
          pinned: document.is_favorite === true,
          updated_at: document.updated_at
        }))
      });
    }
  };

  const getDocument: ToolDefinition = {
    name: "get_document",
    title: "Read a document",
    description:
      "Read one document: its metadata (manager, status, priority, responsible person, tags), its position in the tree, its sub-documents and its content as Markdown. Internal links in the content look like /pages/<id> or /documents/<id>.",
    inputSchema: schema({ id: idProperty("document"), format: formatProperty, max_chars: maxCharsProperty }, ["id"]),
    annotations: READ_ONLY,
    run: async (args) => {
      const parsed = parseArguments(getDocumentInput, args);
      if (!parsed.ok) return parsed.result;

      const { id, format: outputFormat, max_chars: limit } = parsed.data;
      const supabase = getClient();
      const found = await rows<DocumentDetailRow>(
        supabase.from("documents").select(`${DOCUMENT_LIST_COLUMNS},created_at,content`).eq("id", id).limit(1)
      );

      const document = found[0];
      if (!document) return fail(`No document with id ${id}.`);

      const [managers, siblings, users, links] = await Promise.all([
        rows<ManagerRow>(
          supabase.from("document_managers").select("id,name,icon,description").eq("id", document.manager_id).limit(1)
        ),
        rows<DocumentTreeRow>(
          supabase
            .from("documents")
            .select("id,parent_document_id,title")
            .eq("manager_id", document.manager_id)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true })
            .limit(ROW_LIMIT)
        ),
        document.responsible_id
          ? rows<UserRow>(supabase.from("users").select("id,full_name,email").eq("id", document.responsible_id).limit(1))
          : Promise.resolve([]),
        rows<{ tag_id: string }>(supabase.from("document_tags").select("tag_id").eq("document_id", document.id).limit(ROW_LIMIT))
      ]);

      const tagIds = links.map((link) => link.tag_id);
      const tags = tagIds.length
        ? await rows<TagRow>(supabase.from("tags").select("id,name").in("id", tagIds).limit(ROW_LIMIT))
        : [];

      const manager = managers[0];
      const responsible = users[0] ? users[0].full_name || users[0].email : null;
      const ancestors = collectAncestors(siblings, document.id, (item) => item.parent_document_id);
      const children = siblings.filter((item) => item.parent_document_id === document.id);
      const header = [
        `# ${document.title}`,
        `- type: document`,
        `- id: ${document.id}`,
        `- manager: ${manager?.name ?? "unknown"}${manager ? ` (id: ${manager.id})` : ""}`,
        `- path: ${[manager?.name ?? "Documents", ...ancestors.map((ancestor) => ancestor.title), document.title].join(" > ")}`,
        `- status: ${document.status}`,
        `- priority: ${document.priority}`,
        `- responsible: ${responsible ?? "unassigned"}`,
        `- tags: ${tags.map((tag) => tag.name).join(", ") || "none"}`,
        ...(document.short_description ? [`- description: ${document.short_description}`] : []),
        ...(document.is_favorite ? ["- pinned: yes"] : []),
        `- created: ${document.created_at}`,
        `- updated: ${document.updated_at}`,
        ...(children.length
          ? [`- sub-documents:`, ...children.map((child) => `  - ${child.title} (id: ${child.id})`)]
          : [])
      ].join("\n");

      return text(`${header}\n\n---\n\n${renderBody(document.content, outputFormat, limit)}`);
    }
  };

  const getBacklinks: ToolDefinition = {
    name: "get_backlinks",
    title: "Find links to a page or document",
    description:
      "List the pages and documents that link to a given page or document, with the text of each link. Useful to see where something is referenced before changing it.",
    inputSchema: schema(
      {
        type: { type: "string", enum: ["page", "document"], description: "What the id refers to." },
        id: idProperty("page or document")
      },
      ["type", "id"]
    ),
    annotations: READ_ONLY,
    run: async (args) => {
      const parsed = parseArguments(getBacklinksInput, args);
      if (!parsed.ok) return parsed.result;

      const { type, id } = parsed.data;
      const result = await fetchBacklinks(getClient(), { type, id });

      return json({
        target: { type, id },
        count: result.items.length,
        incomplete: result.incomplete,
        backlinks: result.items.map((item) => ({
          type: item.type,
          id: item.id,
          title: item.title,
          in: item.type === "document" ? item.context : "Pages",
          link_texts: item.labels,
          links: item.count
        }))
      });
    }
  };

  return [search, listPages, getPage, listManagers, listDocuments, getDocument, getBacklinks];
}
