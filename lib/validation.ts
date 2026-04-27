import { z } from "zod";

export const roleSchema = z.enum(["admin", "member", "reader"]);
export const documentStatusSchema = z.enum(["todo", "in_progress", "review", "done"]);
export const documentPrioritySchema = z.enum(["low", "medium", "high", "critical"]);
export const sessionStatusSchema = z.enum(["planned", "in_progress", "done", "cancelled"]);
export const mediaTypeSchema = z.enum(["image", "youtube", "video", "document", "link"]);

export const pageSchema = z.object({
  title: z.string().trim().min(1, "Titre requis").max(140),
  icon: z.string().trim().min(1).max(12).default("📄"),
  category: z.string().trim().min(1).max(80).default("Général")
});

export const managerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  icon: z.string().trim().min(1).max(12).default("📁"),
  description: z.string().trim().max(400).optional().nullable()
});

export const documentSchema = z.object({
  title: z.string().trim().min(1).max(160),
  short_description: z.string().trim().max(500).optional().nullable(),
  status: documentStatusSchema.default("todo"),
  priority: documentPrioritySchema.default("medium"),
  responsible_id: z.string().uuid().optional().nullable(),
  tags: z.string().optional()
});

export const planningSessionSchema = z.object({
  title: z.string().trim().min(1).max(160),
  session_date: z.string().min(1),
  start_time: z.string().min(1),
  end_time: z.string().min(1),
  description: z.string().trim().max(1500).optional().nullable(),
  objective: z.string().trim().max(500).optional().nullable(),
  voice_url: z.string().trim().url().optional().or(z.literal("")).nullable(),
  status: sessionStatusSchema.default("planned"),
  participants: z.string().optional()
});

export const mediaItemSchema = z.object({
  title: z.string().trim().min(1).max(160),
  type: mediaTypeSchema.default("link"),
  url: z.string().trim().url(),
  description: z.string().trim().max(800).optional().nullable(),
  tags: z.string().optional()
});

export const allowedEmailSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  role: roleSchema.default("member")
});

export const workspaceSettingsSchema = z.object({
  project_name: z.string().trim().min(1).max(120),
  logo_url: z.string().trim().url().optional().or(z.literal("")).nullable(),
  theme: z.enum(["dark", "light"]).default("dark")
});

export function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function nullableString(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseTagsInput(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 24);
}

export function parseParticipantsInput(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 32);
}
