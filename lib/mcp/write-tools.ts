import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { fetchBacklinks } from "@/lib/backlinks";
import { collectAncestors } from "@/lib/hierarchy";
import {
  addBlocks,
  describeLoss,
  docFromBlocks,
  MAX_CONTENT_CHARS,
  replaceInText,
  type EditorDoc
} from "@/lib/mcp/content-edit";
import { markdownToTiptap, MarkdownError, MAX_MARKDOWN_CHARS, type JsonNode } from "@/lib/mcp/markdown-tiptap";
import type { ToolDefinition, ToolResult } from "@/lib/mcp/protocol";
import { tiptapToMarkdown } from "@/lib/mcp/tiptap-markdown";
import { fail, idProperty, json, parseArguments, ROW_LIMIT, rows, schema, uuid, type Query } from "@/lib/mcp/tool-kit";
import { documentPrioritySchema, documentStatusSchema } from "@/lib/validation";

// The write tools. They exist only when the server owner sets MCP_ALLOW_WRITE=true, and they run
// through the service-role client, so the app's own permission checks (canWrite / canDelete)
// do not apply: the guard rails live here.
//   - nothing is attributed to a user (created_by / updated_by stay null: there is no user);
//   - deleting needs the exact title and refuses items that still have children;
//   - rewriting a whole text needs the version that was read and refuses to drop images or
//     rich formatting unless told so; small edits (append, replace_text) never rewrite the rest;
//   - content is written with a compare-and-set on updated_at so a concurrent edit is not overwritten.

export function isWriteEnabled() {
  const value = process.env.MCP_ALLOW_WRITE?.trim().toLowerCase();
  return value === "true" || value === "1";
}

const STATUSES = documentStatusSchema.options;
const PRIORITIES = documentPrioritySchema.options;
const TAG_COLORS = ["#3dd6b3", "#8fb3ff", "#f3b862", "#f87171", "#65d68a", "#d9a8ff"];
const MOVE_BATCH = 10;
const BACKUP_CHARS = 30_000;

const CREATE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const UPDATE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const OVERWRITE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false } as const;
const DELETE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } as const;

// ---------------------------------------------------------------------------------------
// Inputs (each JSON Schema below must describe the same fields as its zod schema)

const singleLine = (value: string) => !/[\r\n]/.test(value);
const LINE = "must be a single line";

const pageTitle = z.string().trim().min(1).max(140).refine(singleLine, LINE);
const documentTitle = z.string().trim().min(1).max(160).refine(singleLine, LINE);
const icon = z.string().trim().min(1).max(12).refine(singleLine, LINE);
const category = z.string().trim().min(1).max(80).refine(singleLine, LINE);
const shortDescription = z.string().trim().max(500);
const tagName = z.string().trim().min(1).max(60).refine(singleLine, LINE);
const tagList = z.array(tagName).max(24);
const markdown = z.string().max(MAX_MARKDOWN_CHARS);
const nonBlankMarkdown = markdown.refine((value) => value.trim() !== "", "must not be empty");
const parentRef = z.union([z.literal("root"), uuid]);
const position = z.number().int().min(0).max(10_000);

const createPageInput = z
  .object({
    title: pageTitle,
    icon: icon.optional(),
    category: category.optional(),
    parent_id: uuid.optional(),
    content_markdown: markdown.optional()
  })
  .strict();

const createDocumentInput = z
  .object({
    manager_id: uuid,
    title: documentTitle,
    short_description: shortDescription.optional(),
    status: documentStatusSchema.optional(),
    priority: documentPrioritySchema.optional(),
    responsible_id: uuid.optional(),
    parent_id: uuid.optional(),
    tags: tagList.optional(),
    content_markdown: markdown.optional()
  })
  .strict();

const updatePageInput = z
  .object({
    id: uuid,
    title: pageTitle.optional(),
    icon: icon.optional(),
    category: category.optional(),
    pinned: z.boolean().optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 1, "Provide at least one field to change.");

const updateDocumentInput = z
  .object({
    id: uuid,
    title: documentTitle.optional(),
    short_description: z.union([shortDescription, z.null()]).optional(),
    status: documentStatusSchema.optional(),
    priority: documentPrioritySchema.optional(),
    responsible_id: z.union([uuid, z.null()]).optional(),
    pinned: z.boolean().optional(),
    tags: tagList.optional(),
    add_tags: tagList.optional(),
    remove_tags: tagList.optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 1, "Provide at least one field to change.")
  .refine(
    (value) => value.tags === undefined || (value.add_tags === undefined && value.remove_tags === undefined),
    "tags replaces the whole list: do not combine it with add_tags or remove_tags."
  );

const movePageInput = z.object({ id: uuid, parent_id: parentRef, position: position.optional() }).strict();

const moveDocumentInput = z
  .object({ id: uuid, parent_id: parentRef, manager_id: uuid.optional(), position: position.optional() })
  .strict();

const editContentInput = z.discriminatedUnion("operation", [
  z
    .object({
      id: uuid,
      operation: z.literal("append"),
      markdown: nonBlankMarkdown,
      position: z.enum(["end", "start"]).default("end")
    })
    .strict(),
  z
    .object({
      id: uuid,
      operation: z.literal("replace_text"),
      find: z.string().min(1).max(2000).refine(singleLine, "must sit on a single line"),
      replace: z.string().max(2000).refine(singleLine, "must be a single line"),
      replace_all: z.boolean().default(false)
    })
    .strict(),
  z
    .object({
      id: uuid,
      operation: z.literal("rewrite"),
      markdown: nonBlankMarkdown,
      expected_updated_at: z.string().min(10).max(64),
      allow_lossy: z.boolean().default(false)
    })
    .strict()
]);

const deleteInput = z.object({ id: uuid, expected_title: z.string().trim().min(1).max(200) }).strict();

const stringProperty = (description: string, min: number, max: number) => ({
  type: "string",
  minLength: min,
  maxLength: max,
  description
});
const markdownProperty = (description: string) => ({ type: "string", maxLength: MAX_MARKDOWN_CHARS, description });
const parentProperty = (what: string) => ({
  type: "string",
  description: `'root' to make it a top-level ${what}, or the UUID of the ${what} to put it under.`
});
const positionProperty = {
  type: "integer",
  minimum: 0,
  description: "Index among the new siblings (0 = first). Omit to put it last."
};
const tagsProperty = (description: string) => ({
  type: "array",
  items: { type: "string", minLength: 1, maxLength: 60 },
  maxItems: 24,
  description
});

const MARKDOWN_HELP =
  "Markdown supports headings (levels beyond 3 become level 3), paragraphs (a single line break stays a line break), bold, italic, strikethrough, inline code, links, images (https URLs only), bullet, numbered and task lists (- [ ] / - [x]), quotes, code blocks, tables and horizontal rules. Internal links are written [text](/pages/<id>) or [text](/documents/<id>).";

// ---------------------------------------------------------------------------------------
// Helpers

type Client = SupabaseClient;

type TreeRow = { id: string; title: string };
type PageTreeRow = TreeRow & { parent_page_id: string | null };
type DocumentTreeRow = TreeRow & { parent_document_id: string | null };
type PageOrderRow = PageTreeRow & { sort_order: number };
type DocumentOrderRow = DocumentTreeRow & { manager_id: string; sort_order: number };
type TagRow = { id: string; name: string };

/** Runs a query only to raise its error, if any. */
async function ok(query: Query) {
  await rows(query);
}

async function inBatches<T>(items: T[], size: number, worker: (item: T) => Promise<unknown>) {
  for (let start = 0; start < items.length; start += size) {
    await Promise.all(items.slice(start, start + size).map(worker));
  }
}

function convert(input: string): { ok: true; blocks: JsonNode[] } | { ok: false; result: ToolResult } {
  try {
    return { ok: true, blocks: markdownToTiptap(input) };
  } catch (error) {
    if (error instanceof MarkdownError) {
      return { ok: false, result: fail(error.message) };
    }
    throw error;
  }
}

function tooBig(doc: EditorDoc) {
  return JSON.stringify(doc).length > MAX_CONTENT_CHARS;
}

const TOO_BIG = `The resulting content would be larger than ${MAX_CONTENT_CHARS} characters. Split it across several pages or documents.`;

async function nextPageSortOrder(supabase: Client, parentId: string | null) {
  let query = supabase.from("pages").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  query = parentId ? query.eq("parent_page_id", parentId) : query.is("parent_page_id", null);
  const found = await rows<{ sort_order: number }>(query);
  return typeof found[0]?.sort_order === "number" ? found[0].sort_order + 1 : 0;
}

async function nextDocumentSortOrder(supabase: Client, managerId: string, parentId: string | null) {
  let query = supabase
    .from("documents")
    .select("sort_order")
    .eq("manager_id", managerId)
    .order("sort_order", { ascending: false })
    .limit(1);
  query = parentId ? query.eq("parent_document_id", parentId) : query.is("parent_document_id", null);
  const found = await rows<{ sort_order: number }>(query);
  return typeof found[0]?.sort_order === "number" ? found[0].sort_order + 1 : 0;
}

async function pagePath(supabase: Client, id: string) {
  const tree = await rows<PageTreeRow>(supabase.from("pages").select("id,title,parent_page_id").limit(ROW_LIMIT));
  const ancestors = collectAncestors(tree, id, (item) => item.parent_page_id);
  return ["Pages", ...ancestors.map((ancestor) => ancestor.title), tree.find((item) => item.id === id)?.title ?? ""].join(" > ");
}

async function documentPath(supabase: Client, id: string, managerId: string) {
  const [tree, managers] = await Promise.all([
    rows<DocumentTreeRow>(
      supabase.from("documents").select("id,title,parent_document_id").eq("manager_id", managerId).limit(ROW_LIMIT)
    ),
    rows<{ name: string }>(supabase.from("document_managers").select("name").eq("id", managerId).limit(1))
  ]);
  const ancestors = collectAncestors(tree, id, (item) => item.parent_document_id);
  return [
    managers[0]?.name ?? "Documents",
    ...ancestors.map((ancestor) => ancestor.title),
    tree.find((item) => item.id === id)?.title ?? ""
  ].join(" > ");
}

/** True when `candidateId` is `ancestorId` or lies below it. */
function isWithin<T extends { id: string }>(
  items: T[],
  ancestorId: string,
  candidateId: string,
  parentOf: (item: T) => string | null
) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const visited = new Set<string>();
  let current = byId.get(candidateId);

  while (current && !visited.has(current.id)) {
    if (current.id === ancestorId) return true;
    visited.add(current.id);
    const parentId = parentOf(current);
    current = parentId ? byId.get(parentId) : undefined;
  }

  return false;
}

function descendantIds<T extends { id: string }>(items: T[], rootId: string, parentOf: (item: T) => string | null) {
  const found: string[] = [];
  const seen = new Set<string>([rootId]);
  const queue = [rootId];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const item of items) {
      if (parentOf(item) === current && !seen.has(item.id)) {
        seen.add(item.id);
        found.push(item.id);
        queue.push(item.id);
      }
    }
  }

  return found;
}

// --- tags (documents only: the app has no tags on pages)

async function linkedTags(supabase: Client, documentId: string) {
  const links = await rows<{ id: string; tag_id: string }>(
    supabase.from("document_tags").select("id,tag_id").eq("document_id", documentId).limit(ROW_LIMIT)
  );
  if (links.length === 0) return [];

  const tags = await rows<TagRow>(
    supabase.from("tags").select("id,name").in("id", links.map((link) => link.tag_id)).limit(ROW_LIMIT)
  );
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  return links.flatMap((link) => {
    const tag = byId.get(link.tag_id);
    return tag ? [{ linkId: link.id, tag }] : [];
  });
}

/** Existing tags are reused whatever their letter case; the missing ones are created. */
async function ensureTags(supabase: Client, names: string[]) {
  const all = await rows<TagRow>(supabase.from("tags").select("id,name").limit(ROW_LIMIT));
  const byLower = new Map(all.map((tag) => [tag.name.toLowerCase(), tag]));
  const wanted: TagRow[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();

  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const existing = byLower.get(key);
    if (existing) wanted.push(existing);
    else missing.push(name);
  }

  if (missing.length > 0) {
    const created = await rows<TagRow>(
      supabase
        .from("tags")
        .insert(missing.map((name, index) => ({ name, color: TAG_COLORS[(all.length + index) % TAG_COLORS.length] })))
        .select("id,name")
    );
    wanted.push(...created);
  }

  return wanted;
}

async function changeTags(
  supabase: Client,
  documentId: string,
  change: { mode: "replace" | "add" | "remove"; names: string[] }
) {
  const current = await linkedTags(supabase, documentId);

  if (change.mode === "remove") {
    const drop = new Set(change.names.map((name) => name.toLowerCase()));
    const removed = current.filter((entry) => drop.has(entry.tag.name.toLowerCase()));
    if (removed.length > 0) {
      await ok(supabase.from("document_tags").delete().in("id", removed.map((entry) => entry.linkId)));
    }
    return current.filter((entry) => !removed.includes(entry)).map((entry) => entry.tag.name);
  }

  const wanted = await ensureTags(supabase, change.names);
  const wantedIds = new Set(wanted.map((tag) => tag.id));
  const currentIds = new Set(current.map((entry) => entry.tag.id));

  if (change.mode === "replace") {
    const stale = current.filter((entry) => !wantedIds.has(entry.tag.id));
    if (stale.length > 0) {
      await ok(supabase.from("document_tags").delete().in("id", stale.map((entry) => entry.linkId)));
    }
  }

  const added = wanted.filter((tag) => !currentIds.has(tag.id));
  if (added.length > 0) {
    await ok(supabase.from("document_tags").insert(added.map((tag) => ({ document_id: documentId, tag_id: tag.id }))));
  }

  return change.mode === "replace"
    ? wanted.map((tag) => tag.name)
    : [...current.map((entry) => entry.tag.name), ...added.map((tag) => tag.name)];
}

// ---------------------------------------------------------------------------------------
// Tools

export function createWriteTools(getClient: () => SupabaseClient, enabled: () => boolean = isWriteEnabled): ToolDefinition[] {
  const createPage: ToolDefinition = {
    name: "create_page",
    title: "Create a page",
    description: `Create a page, at the top level or under a parent page. It goes last among its siblings and, when no icon or category is given, takes those of its parent. content_markdown is optional. ${MARKDOWN_HELP}`,
    inputSchema: schema(
      {
        title: stringProperty("Page title (one line).", 1, 140),
        icon: stringProperty("An emoji, e.g. 📄 (default: the parent's, else 📄).", 1, 12),
        category: stringProperty("Category label, e.g. 'Lore' (default: the parent's, else 'Général').", 1, 80),
        parent_id: idProperty("parent page (omit for a top-level page)"),
        content_markdown: markdownProperty("Initial content as Markdown. Omit for an empty page.")
      },
      ["title"]
    ),
    annotations: CREATE,
    enabled,
    run: async (args) => {
      const parsed = parseArguments(createPageInput, args);
      if (!parsed.ok) return parsed.result;

      const { title, icon: chosenIcon, category: chosenCategory, parent_id: parentId, content_markdown: source } = parsed.data;
      const supabase = getClient();

      let parent: { id: string; icon: string | null; category: string | null } | undefined;
      if (parentId) {
        parent = (await rows<NonNullable<typeof parent>>(supabase.from("pages").select("id,icon,category").eq("id", parentId).limit(1)))[0];
        if (!parent) return fail(`No page with id ${parentId} to use as parent.`);
      }

      const converted = convert(source ?? "");
      if (!converted.ok) return converted.result;
      const content = docFromBlocks(converted.blocks);
      if (tooBig(content)) return fail(TOO_BIG);

      const created = await rows<{ id: string; title: string; icon: string; category: string; parent_page_id: string | null }>(
        supabase
          .from("pages")
          .insert({
            title,
            icon: chosenIcon ?? parent?.icon ?? "📄",
            category: chosenCategory ?? parent?.category ?? "Général",
            parent_page_id: parentId ?? null,
            sort_order: await nextPageSortOrder(supabase, parentId ?? null),
            content,
            created_by: null,
            updated_by: null
          })
          .select("id,title,icon,category,parent_page_id")
      );

      const page = created[0];
      if (!page) throw new Error("The page was not created.");

      return json({
        created: {
          type: "page",
          id: page.id,
          title: page.title,
          icon: page.icon,
          category: page.category,
          parent_id: page.parent_page_id,
          path: await pagePath(supabase, page.id),
          link: `/pages/${page.id}`
        }
      });
    }
  };

  const createDocument: ToolDefinition = {
    name: "create_document",
    title: "Create a document",
    description: `Create a document inside a document manager, optionally under a parent document of the same manager. It goes last among its siblings. status defaults to todo and priority to medium. content_markdown is optional. ${MARKDOWN_HELP}`,
    inputSchema: schema(
      {
        manager_id: idProperty("document manager (see list_managers)"),
        title: stringProperty("Document title (one line).", 1, 160),
        short_description: stringProperty("One-line summary shown in lists.", 0, 500),
        status: { type: "string", enum: [...STATUSES], description: "Default: todo." },
        priority: { type: "string", enum: [...PRIORITIES], description: "Default: medium." },
        responsible_id: idProperty("person in charge (a user id, see list_documents / get_document)"),
        parent_id: idProperty("parent document, which must belong to the same manager (omit for a top-level document)"),
        tags: tagsProperty("Tags to attach. Missing tags are created; existing ones are reused whatever their case."),
        content_markdown: markdownProperty("Initial content as Markdown. Omit for an empty document.")
      },
      ["manager_id", "title"]
    ),
    annotations: CREATE,
    enabled,
    run: async (args) => {
      const parsed = parseArguments(createDocumentInput, args);
      if (!parsed.ok) return parsed.result;

      const input = parsed.data;
      const supabase = getClient();

      const manager = (await rows<{ id: string }>(supabase.from("document_managers").select("id").eq("id", input.manager_id).limit(1)))[0];
      if (!manager) return fail(`No document manager with id ${input.manager_id}.`);

      if (input.parent_id) {
        const parent = (await rows<{ id: string; manager_id: string }>(
          supabase.from("documents").select("id,manager_id").eq("id", input.parent_id).limit(1)
        ))[0];
        if (!parent) return fail(`No document with id ${input.parent_id} to use as parent.`);
        if (parent.manager_id !== input.manager_id) {
          return fail("The parent document belongs to another manager. A document lives in the same manager as its parent.");
        }
      }

      if (input.responsible_id) {
        const user = (await rows<{ id: string }>(supabase.from("users").select("id").eq("id", input.responsible_id).limit(1)))[0];
        if (!user) return fail(`No user with id ${input.responsible_id}.`);
      }

      const converted = convert(input.content_markdown ?? "");
      if (!converted.ok) return converted.result;
      const content = docFromBlocks(converted.blocks);
      if (tooBig(content)) return fail(TOO_BIG);

      const created = await rows<{ id: string; manager_id: string; title: string; status: string; priority: string }>(
        supabase
          .from("documents")
          .insert({
            manager_id: input.manager_id,
            parent_document_id: input.parent_id ?? null,
            title: input.title,
            short_description: input.short_description?.trim() ? input.short_description : null,
            status: input.status ?? "todo",
            priority: input.priority ?? "medium",
            responsible_id: input.responsible_id ?? null,
            sort_order: await nextDocumentSortOrder(supabase, input.manager_id, input.parent_id ?? null),
            content,
            created_by: null,
            updated_by: null
          })
          .select("id,manager_id,title,status,priority")
      );

      const document = created[0];
      if (!document) throw new Error("The document was not created.");

      let tags: string[] = [];
      let warning: string | undefined;
      if (input.tags && input.tags.length > 0) {
        try {
          tags = await changeTags(supabase, document.id, { mode: "add", names: input.tags });
        } catch (error) {
          warning = `The document was created but its tags could not be saved: ${error instanceof Error ? error.message : "unknown error"}. Set them with update_document.`;
        }
      }

      return json({
        created: {
          type: "document",
          id: document.id,
          title: document.title,
          manager_id: document.manager_id,
          status: document.status,
          priority: document.priority,
          tags,
          path: await documentPath(supabase, document.id, document.manager_id),
          link: `/documents/${document.id}`
        },
        ...(warning ? { warning } : {})
      });
    }
  };

  const updatePage: ToolDefinition = {
    name: "update_page",
    title: "Change a page's properties",
    description:
      "Change the title, icon or category of a page, or pin/unpin it. Only the fields you pass change. Use edit_page_content for the text and move_page to change where it sits in the tree.",
    inputSchema: schema(
      {
        id: idProperty("page"),
        title: stringProperty("New title (one line).", 1, 140),
        icon: stringProperty("New emoji icon.", 1, 12),
        category: stringProperty("New category label.", 1, 80),
        pinned: { type: "boolean", description: "true to pin the page (favorite), false to unpin it." }
      },
      ["id"]
    ),
    annotations: UPDATE,
    enabled,
    run: async (args) => {
      const parsed = parseArguments(updatePageInput, args);
      if (!parsed.ok) return parsed.result;

      const { id, title, icon: newIcon, category: newCategory, pinned } = parsed.data;
      const patch: Record<string, unknown> = { updated_by: null };
      if (title !== undefined) patch.title = title;
      if (newIcon !== undefined) patch.icon = newIcon;
      if (newCategory !== undefined) patch.category = newCategory;
      if (pinned !== undefined) patch.is_favorite = pinned;

      const updated = await rows<{ id: string; title: string; icon: string; category: string; is_favorite: boolean; updated_at: string }>(
        getClient().from("pages").update(patch).eq("id", id).select("id,title,icon,category,is_favorite,updated_at")
      );
      const page = updated[0];
      if (!page) return fail(`No page with id ${id}.`);

      return json({
        updated: {
          type: "page",
          id: page.id,
          title: page.title,
          icon: page.icon,
          category: page.category,
          pinned: page.is_favorite === true,
          updated_at: page.updated_at
        }
      });
    }
  };

  const updateDocument: ToolDefinition = {
    name: "update_document",
    title: "Change a document's properties",
    description:
      "Change the title, description, status, priority, responsible person, pin state or tags of a document. Only the fields you pass change. tags replaces the whole tag list; add_tags and remove_tags change it incrementally (do not combine them with tags). Use edit_document_content for the text and move_document to change where it sits.",
    inputSchema: schema(
      {
        id: idProperty("document"),
        title: stringProperty("New title (one line).", 1, 160),
        short_description: {
          type: ["string", "null"],
          maxLength: 500,
          description: "New one-line summary; null or an empty string clears it."
        },
        status: { type: "string", enum: [...STATUSES], description: "New status." },
        priority: { type: "string", enum: [...PRIORITIES], description: "New priority." },
        responsible_id: {
          type: ["string", "null"],
          format: "uuid",
          description: "User id of the person in charge; null removes the assignment."
        },
        pinned: { type: "boolean", description: "true to pin the document (favorite), false to unpin it." },
        tags: tagsProperty("Replace ALL tags with these ([] removes every tag)."),
        add_tags: tagsProperty("Tags to add, keeping the existing ones."),
        remove_tags: tagsProperty("Tags to remove (matched case-insensitively), keeping the others.")
      },
      ["id"]
    ),
    annotations: UPDATE,
    enabled,
    run: async (args) => {
      const parsed = parseArguments(updateDocumentInput, args);
      if (!parsed.ok) return parsed.result;

      const input = parsed.data;
      const supabase = getClient();

      if (input.responsible_id) {
        const user = (await rows<{ id: string }>(supabase.from("users").select("id").eq("id", input.responsible_id).limit(1)))[0];
        if (!user) return fail(`No user with id ${input.responsible_id}.`);
      }

      const patch: Record<string, unknown> = { updated_by: null };
      if (input.title !== undefined) patch.title = input.title;
      if (input.short_description !== undefined) {
        patch.short_description = input.short_description?.trim() ? input.short_description : null;
      }
      if (input.status !== undefined) patch.status = input.status;
      if (input.priority !== undefined) patch.priority = input.priority;
      if (input.responsible_id !== undefined) patch.responsible_id = input.responsible_id;
      if (input.pinned !== undefined) patch.is_favorite = input.pinned;

      // Always an UPDATE, so that a tags-only change also refreshes updated_at like the app does.
      const updated = await rows<{
        id: string;
        manager_id: string;
        title: string;
        short_description: string | null;
        status: string;
        priority: string;
        responsible_id: string | null;
        is_favorite: boolean;
        updated_at: string;
      }>(
        supabase
          .from("documents")
          .update(patch)
          .eq("id", input.id)
          .select("id,manager_id,title,short_description,status,priority,responsible_id,is_favorite,updated_at")
      );
      const document = updated[0];
      if (!document) return fail(`No document with id ${input.id}.`);

      const tagChange =
        input.tags !== undefined
          ? { mode: "replace" as const, names: input.tags }
          : input.add_tags?.length
            ? { mode: "add" as const, names: input.add_tags }
            : input.remove_tags?.length
              ? { mode: "remove" as const, names: input.remove_tags }
              : null;

      let tags: string[] | undefined;
      let warning: string | undefined;
      if (tagChange) {
        try {
          tags = await changeTags(supabase, document.id, tagChange);
        } catch (error) {
          warning = `The other changes were saved but the tags could not be updated: ${error instanceof Error ? error.message : "unknown error"}.`;
        }
      } else if (input.add_tags !== undefined || input.remove_tags !== undefined) {
        tags = (await linkedTags(supabase, document.id)).map((entry) => entry.tag.name);
      }

      return json({
        updated: {
          type: "document",
          id: document.id,
          title: document.title,
          description: document.short_description,
          status: document.status,
          priority: document.priority,
          responsible_id: document.responsible_id,
          pinned: document.is_favorite === true,
          ...(tags ? { tags } : {}),
          updated_at: document.updated_at
        },
        ...(warning ? { warning } : {})
      });
    }
  };

  const movePage: ToolDefinition = {
    name: "move_page",
    title: "Move a page in the tree",
    description:
      "Move a page (with its sub-pages) under another page or to the top level, and optionally choose its position among the new siblings. A page cannot be moved into its own sub-pages.",
    inputSchema: schema(
      { id: idProperty("page to move"), parent_id: parentProperty("page"), position: positionProperty },
      ["id", "parent_id"]
    ),
    annotations: UPDATE,
    enabled,
    run: async (args) => {
      const parsed = parseArguments(movePageInput, args);
      if (!parsed.ok) return parsed.result;

      const { id, parent_id: target, position: wanted } = parsed.data;
      const parentId = target === "root" ? null : target;
      const supabase = getClient();

      const pages = await rows<PageOrderRow>(
        supabase
          .from("pages")
          .select("id,title,parent_page_id,sort_order")
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true })
          .limit(ROW_LIMIT)
      );
      if (pages.length >= ROW_LIMIT) return fail("There are too many pages to move one safely from here.");

      const moved = pages.find((page) => page.id === id);
      if (!moved) return fail(`No page with id ${id}.`);

      if (parentId) {
        if (parentId === id) return fail("A page cannot be its own parent.");
        if (!pages.some((page) => page.id === parentId)) return fail(`No page with id ${parentId} to use as parent.`);
        if (isWithin(pages, id, parentId, (page) => page.parent_page_id)) {
          return fail("A page cannot be moved into one of its own sub-pages.");
        }
      }

      const siblings = pages.filter((page) => (page.parent_page_id ?? null) === parentId && page.id !== id);
      const at = wanted === undefined ? siblings.length : Math.min(wanted, siblings.length);
      const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];

      if (wanted === undefined) {
        const last = siblings.reduce((max, page) => Math.max(max, page.sort_order), -1);
        updates.push({ id, patch: { parent_page_id: parentId, sort_order: last + 1, updated_by: null } });
      } else {
        [...siblings.slice(0, at), moved, ...siblings.slice(at)].forEach((page, index) => {
          if (page.id === id) {
            updates.push({ id, patch: { parent_page_id: parentId, sort_order: index, updated_by: null } });
          } else if (page.sort_order !== index) {
            updates.push({ id: page.id, patch: { sort_order: index, updated_by: null } });
          }
        });
      }

      await inBatches(updates, MOVE_BATCH, (update) => ok(supabase.from("pages").update(update.patch).eq("id", update.id)));

      return json({
        moved: { type: "page", id, title: moved.title, parent_id: parentId, position: at, path: await pagePath(supabase, id) }
      });
    }
  };

  const moveDocument: ToolDefinition = {
    name: "move_document",
    title: "Move a document in the tree",
    description:
      "Move a document (with its sub-documents) under another document or to the top level of its manager, and optionally choose its position among the new siblings. Pass manager_id to move it, with all its sub-documents, to another manager; the new parent must then belong to that manager. A document cannot be moved into its own sub-documents.",
    inputSchema: schema(
      {
        id: idProperty("document to move"),
        parent_id: parentProperty("document"),
        manager_id: idProperty("manager to move it to (omit to stay in the same manager)"),
        position: positionProperty
      },
      ["id", "parent_id"]
    ),
    annotations: UPDATE,
    enabled,
    run: async (args) => {
      const parsed = parseArguments(moveDocumentInput, args);
      if (!parsed.ok) return parsed.result;

      const { id, parent_id: target, manager_id: wantedManager, position: wanted } = parsed.data;
      const parentId = target === "root" ? null : target;
      const supabase = getClient();

      const documents = await rows<DocumentOrderRow>(
        supabase
          .from("documents")
          .select("id,title,manager_id,parent_document_id,sort_order")
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true })
          .limit(ROW_LIMIT)
      );
      if (documents.length >= ROW_LIMIT) return fail("There are too many documents to move one safely from here.");

      const moved = documents.find((document) => document.id === id);
      if (!moved) return fail(`No document with id ${id}.`);

      const managerId = wantedManager ?? moved.manager_id;
      if (managerId !== moved.manager_id) {
        const manager = (await rows<{ id: string }>(supabase.from("document_managers").select("id").eq("id", managerId).limit(1)))[0];
        if (!manager) return fail(`No document manager with id ${managerId}.`);
      }

      if (parentId) {
        if (parentId === id) return fail("A document cannot be its own parent.");
        const parent = documents.find((document) => document.id === parentId);
        if (!parent) return fail(`No document with id ${parentId} to use as parent.`);
        if (parent.manager_id !== managerId) {
          return fail("The new parent belongs to another manager. Pass manager_id of the parent's manager, or choose a parent in the target manager.");
        }
        if (isWithin(documents, id, parentId, (document) => document.parent_document_id)) {
          return fail("A document cannot be moved into one of its own sub-documents.");
        }
      }

      const siblings = documents.filter(
        (document) => document.manager_id === managerId && (document.parent_document_id ?? null) === parentId && document.id !== id
      );
      const at = wanted === undefined ? siblings.length : Math.min(wanted, siblings.length);
      const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];

      if (wanted === undefined) {
        const last = siblings.reduce((max, document) => Math.max(max, document.sort_order), -1);
        updates.push({
          id,
          patch: { manager_id: managerId, parent_document_id: parentId, sort_order: last + 1, updated_by: null }
        });
      } else {
        [...siblings.slice(0, at), moved, ...siblings.slice(at)].forEach((document, index) => {
          if (document.id === id) {
            updates.push({
              id,
              patch: { manager_id: managerId, parent_document_id: parentId, sort_order: index, updated_by: null }
            });
          } else if (document.sort_order !== index) {
            updates.push({ id: document.id, patch: { sort_order: index, updated_by: null } });
          }
        });
      }

      await inBatches(updates, MOVE_BATCH, (update) =>
        ok(supabase.from("documents").update(update.patch).eq("id", update.id))
      );

      // Sub-documents follow their parent to the new manager.
      let followed = 0;
      if (managerId !== moved.manager_id) {
        const below = descendantIds(documents, id, (document) => document.parent_document_id);
        followed = below.length;
        const groups: string[][] = [];
        for (let start = 0; start < below.length; start += 50) groups.push(below.slice(start, start + 50));
        await inBatches(groups, MOVE_BATCH, (group) =>
          ok(supabase.from("documents").update({ manager_id: managerId }).in("id", group))
        );
      }

      return json({
        moved: {
          type: "document",
          id,
          title: moved.title,
          manager_id: managerId,
          parent_id: parentId,
          position: at,
          sub_documents_moved_along: followed,
          path: await documentPath(supabase, id, managerId)
        }
      });
    }
  };

  const contentTool = (kind: "page" | "document"): ToolDefinition => {
    const table = kind === "page" ? "pages" : "documents";
    return {
      name: `edit_${kind}_content`,
      title: `Edit the text of a ${kind}`,
      description: `Edit the text of a ${kind}. Choose the smallest operation that does the job. 'append' adds Markdown at the end (or the start) and leaves the existing text untouched. 'replace_text' swaps a piece of text for another everywhere it appears inside one run of text, keeping all formatting (it cannot see text that formatting splits, for example a word that is half bold). 'rewrite' replaces the whole content with new Markdown: it needs expected_updated_at (the 'updated' value shown by get_${kind}, so you must have read the latest version) and it REFUSES when the ${kind} holds images, embedded videos, text colors or alignment that Markdown cannot carry over, unless allow_lossy is true. ${MARKDOWN_HELP} If the ${kind} is open in someone's browser they must reload it: the editor keeps its own copy and would overwrite this change the next time they type.`,
      inputSchema: schema(
        {
          id: idProperty(kind),
          operation: {
            type: "string",
            enum: ["append", "replace_text", "rewrite"],
            description: "What to do. append needs markdown; replace_text needs find and replace; rewrite needs markdown and expected_updated_at."
          },
          markdown: markdownProperty("append / rewrite: the Markdown to add, or the new complete content."),
          position: { type: "string", enum: ["end", "start"], default: "end", description: "append: where to add the Markdown." },
          find: stringProperty("replace_text: the exact text to look for (case-sensitive, on one line).", 1, 2000),
          replace: stringProperty("replace_text: the replacement text (may be empty to delete the match).", 0, 2000),
          replace_all: {
            type: "boolean",
            default: false,
            description: "replace_text: replace every occurrence. Without it the call fails when the text appears more than once."
          },
          expected_updated_at: stringProperty(`rewrite: the 'updated' timestamp of the ${kind} as returned by get_${kind}.`, 10, 64),
          allow_lossy: {
            type: "boolean",
            default: false,
            description: "rewrite: allow dropping images or rich formatting Markdown cannot express. Only when the user asked for it."
          }
        },
        ["id", "operation"]
      ),
      annotations: OVERWRITE,
      enabled,
      run: async (args) => {
        const parsed = parseArguments(editContentInput, args);
        if (!parsed.ok) return parsed.result;

        const input = parsed.data;
        const supabase = getClient();
        const row = (
          await rows<{ id: string; title: string; content: unknown; updated_at: string }>(
            supabase.from(table).select("id,title,content,updated_at").eq("id", input.id).limit(1)
          )
        )[0];
        if (!row) return fail(`No ${kind} with id ${input.id}.`);

        let next: EditorDoc;
        let summary: Record<string, unknown>;

        if (input.operation === "append") {
          const converted = convert(input.markdown);
          if (!converted.ok) return converted.result;
          if (converted.blocks.length === 0) return fail("The Markdown produced no content.");

          next = addBlocks(row.content, converted.blocks, input.position);
          summary = { operation: "append", position: input.position, blocks_added: converted.blocks.length };
        } else if (input.operation === "replace_text") {
          const result = replaceInText(row.content, input.find, input.replace);
          if (result.count === 0) {
            return fail(
              `The text was not found. It must match exactly (case included) and sit inside one run of text: a word that is partly bold or partly a link is not matched. Read the ${kind} again to check.`
            );
          }
          if (result.count > 1 && !input.replace_all) {
            return fail(
              `The text appears ${result.count} times. Pass replace_all: true to change them all, or use a longer, more specific 'find'.`
            );
          }

          next = result.doc;
          summary = { operation: "replace_text", replacements: result.count };
        } else {
          if (input.expected_updated_at !== row.updated_at) {
            return fail(
              `expected_updated_at does not match the current version: the ${kind} changed since you read it, or the value is wrong. Read it again with get_${kind} and pass the 'updated' value it shows. Nothing was written.`
            );
          }

          const converted = convert(input.markdown);
          if (!converted.ok) return converted.result;
          if (converted.blocks.length === 0) return fail("The Markdown produced no content.");

          next = docFromBlocks(converted.blocks);
          const lost = describeLoss(row.content, next);
          if (lost.length > 0 && !input.allow_lossy) {
            return fail(
              `Rewriting would lose: ${lost.join("; ")}. Markdown cannot carry these over. Use append or replace_text to keep them, include the images in your Markdown, or pass allow_lossy: true if dropping them is what the user wants. Nothing was written.`
            );
          }

          summary = { operation: "rewrite", blocks: converted.blocks.length, dropped: lost };
        }

        if (tooBig(next)) return fail(TOO_BIG);

        // Compare-and-set: only write if nobody changed the row since it was read.
        const written = await rows<{ updated_at: string }>(
          supabase
            .from(table)
            .update({ content: next, updated_by: null })
            .eq("id", input.id)
            .eq("updated_at", row.updated_at)
            .select("updated_at")
        );
        if (!written[0]) {
          return fail(`The ${kind} was modified by someone else while this edit was prepared, so nothing was written. Read it again and retry.`);
        }

        return json({
          updated: { type: kind, id: row.id, title: row.title, updated_at: written[0].updated_at },
          ...summary,
          note: `If this ${kind} is open in a browser, reload it before editing: the open editor would overwrite this change.`
        });
      }
    };
  };

  const backup = (content: unknown) => {
    const text = tiptapToMarkdown(content);
    return text.length > BACKUP_CHARS ? `${text.slice(0, BACKUP_CHARS)}\n\n[truncated]` : text;
  };

  const deletePage: ToolDefinition = {
    name: "delete_page",
    title: "Delete a page",
    description:
      "PERMANENTLY delete a page. This cannot be undone. Only do it when the user explicitly asked to delete this page. You must pass its exact current title as expected_title, so read the page first and confirm it is the right one. A page that still has sub-pages is refused: move or delete them first. The result lists the pages that linked to it (those links are now broken) and returns the deleted text as Markdown.",
    inputSchema: schema(
      {
        id: idProperty("page to delete"),
        expected_title: stringProperty("The exact title of the page, as shown by get_page. The call fails if it differs.", 1, 200)
      },
      ["id", "expected_title"]
    ),
    annotations: DELETE,
    enabled,
    run: async (args) => {
      const parsed = parseArguments(deleteInput, args);
      if (!parsed.ok) return parsed.result;

      const { id, expected_title: expectedTitle } = parsed.data;
      const supabase = getClient();

      const page = (
        await rows<{ id: string; title: string; content: unknown }>(
          supabase.from("pages").select("id,title,content").eq("id", id).limit(1)
        )
      )[0];
      if (!page) return fail(`No page with id ${id}.`);
      if (page.title.trim() !== expectedTitle) {
        return fail("expected_title does not match the title of this page. Read it with get_page and pass its exact title, only if it really is the page to delete. Nothing was deleted.");
      }

      const children = await rows<TreeRow>(supabase.from("pages").select("id,title").eq("parent_page_id", id).limit(11));
      if (children.length > 0) {
        const shown = children.slice(0, 10).map((child) => `${child.title} (${child.id})`).join(", ");
        return fail(`This page still has sub-pages: ${shown}${children.length > 10 ? ", ..." : ""}. Move or delete them first. Nothing was deleted.`);
      }

      const links = await fetchBacklinks(supabase, { type: "page", id });
      const removed = await rows<{ id: string }>(supabase.from("pages").delete().eq("id", id).select("id"));
      if (!removed[0]) return fail("Nothing was deleted: the page no longer exists.");

      return json({
        deleted: { type: "page", id, title: page.title },
        broken_links_from: links.items.slice(0, 20).map((item) => ({ type: item.type, id: item.id, title: item.title })),
        broken_links_incomplete: links.incomplete || links.items.length > 20,
        deleted_content_markdown: backup(page.content)
      });
    }
  };

  const deleteDocument: ToolDefinition = {
    name: "delete_document",
    title: "Delete a document",
    description:
      "PERMANENTLY delete a document. This cannot be undone. Only do it when the user explicitly asked to delete this document. You must pass its exact current title as expected_title, so read the document first and confirm it is the right one. A document that still has sub-documents is refused: move or delete them first. The result lists the items that linked to it (those links are now broken) and returns its properties and text so it could be recreated.",
    inputSchema: schema(
      {
        id: idProperty("document to delete"),
        expected_title: stringProperty("The exact title of the document, as shown by get_document. The call fails if it differs.", 1, 200)
      },
      ["id", "expected_title"]
    ),
    annotations: DELETE,
    enabled,
    run: async (args) => {
      const parsed = parseArguments(deleteInput, args);
      if (!parsed.ok) return parsed.result;

      const { id, expected_title: expectedTitle } = parsed.data;
      const supabase = getClient();

      const document = (
        await rows<{
          id: string;
          title: string;
          manager_id: string;
          short_description: string | null;
          status: string;
          priority: string;
          responsible_id: string | null;
          content: unknown;
        }>(
          supabase
            .from("documents")
            .select("id,title,manager_id,short_description,status,priority,responsible_id,content")
            .eq("id", id)
            .limit(1)
        )
      )[0];
      if (!document) return fail(`No document with id ${id}.`);
      if (document.title.trim() !== expectedTitle) {
        return fail("expected_title does not match the title of this document. Read it with get_document and pass its exact title, only if it really is the document to delete. Nothing was deleted.");
      }

      const children = await rows<TreeRow>(supabase.from("documents").select("id,title").eq("parent_document_id", id).limit(11));
      if (children.length > 0) {
        const shown = children.slice(0, 10).map((child) => `${child.title} (${child.id})`).join(", ");
        return fail(`This document still has sub-documents: ${shown}${children.length > 10 ? ", ..." : ""}. Move or delete them first. Nothing was deleted.`);
      }

      const [links, tags] = await Promise.all([fetchBacklinks(supabase, { type: "document", id }), linkedTags(supabase, id)]);
      const removed = await rows<{ id: string }>(supabase.from("documents").delete().eq("id", id).select("id"));
      if (!removed[0]) return fail("Nothing was deleted: the document no longer exists.");

      return json({
        deleted: {
          type: "document",
          id,
          title: document.title,
          manager_id: document.manager_id,
          description: document.short_description,
          status: document.status,
          priority: document.priority,
          responsible_id: document.responsible_id,
          tags: tags.map((entry) => entry.tag.name)
        },
        broken_links_from: links.items.slice(0, 20).map((item) => ({ type: item.type, id: item.id, title: item.title })),
        broken_links_incomplete: links.incomplete || links.items.length > 20,
        deleted_content_markdown: backup(document.content)
      });
    }
  };

  return [
    createPage,
    createDocument,
    updatePage,
    updateDocument,
    movePage,
    moveDocument,
    contentTool("page"),
    contentTool("document"),
    deletePage,
    deleteDocument
  ];
}
