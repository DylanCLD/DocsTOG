import { z } from "zod";
import type { JsonSchemaObject, ToolResult } from "@/lib/mcp/protocol";

// Helpers shared by the read tools (tools.ts) and the write tools (write-tools.ts).

// Supabase returns at most 1000 rows per request; results built from a full read say so.
export const ROW_LIMIT = 1000;

export const uuid = z.string().uuid();

export type Query = PromiseLike<{ data: unknown; error: { message: string } | null }>;

export async function rows<T>(query: Query): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? (data as T[]) : [];
}

export function text(value: string): ToolResult {
  return { content: [{ type: "text", text: value }] };
}

export function json(value: unknown): ToolResult {
  return text(JSON.stringify(value));
}

export function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

export function parseArguments<S extends z.ZodTypeAny>(
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

export function schema(properties: JsonSchemaObject["properties"], required: string[] = []): JsonSchemaObject {
  return { type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false };
}

export const idProperty = (what: string) => ({ type: "string", format: "uuid", description: `UUID of the ${what}.` });
