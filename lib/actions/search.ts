"use server";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type SearchResult = {
  id: string;
  title: string;
  type: "page" | "document" | "media" | "session";
  href: string;
  subtitle: string | null;
};

export async function searchWorkspace(query: string): Promise<SearchResult[]> {
  await requireProfile();
  const normalized = query.trim();

  if (normalized.length < 2) {
    return [];
  }

  const supabase = await createClient();
  const pattern = `%${normalized}%`;

  const [pages, documents, media, sessions] = await Promise.all([
    supabase
      .from("pages")
      .select("id,title,category")
      .or(`title.ilike.${pattern},category.ilike.${pattern}`)
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("documents")
      .select("id,title,short_description")
      .or(`title.ilike.${pattern},short_description.ilike.${pattern}`)
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("media_items")
      .select("id,title,type")
      .or(`title.ilike.${pattern},description.ilike.${pattern},url.ilike.${pattern}`)
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("planning_sessions")
      .select("id,title,session_date")
      .or(`title.ilike.${pattern},description.ilike.${pattern},objective.ilike.${pattern}`)
      .order("session_date", { ascending: true })
      .limit(5)
  ]);

  return [
    ...((pages.data ?? []).map((page) => ({
      id: page.id,
      title: page.title,
      type: "page" as const,
      href: `/pages/${page.id}`,
      subtitle: page.category
    })) satisfies SearchResult[]),
    ...((documents.data ?? []).map((document) => ({
      id: document.id,
      title: document.title,
      type: "document" as const,
      href: `/documents/${document.id}`,
      subtitle: document.short_description
    })) satisfies SearchResult[]),
    ...((media.data ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      type: "media" as const,
      href: "/media",
      subtitle: item.type
    })) satisfies SearchResult[]),
    ...((sessions.data ?? []).map((session) => ({
      id: session.id,
      title: session.title,
      type: "session" as const,
      href: "/planning",
      subtitle: session.session_date
    })) satisfies SearchResult[])
  ];
}
