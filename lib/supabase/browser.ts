"use client";

import { createBrowserClient } from "@supabase/ssr";
import { assertSupabaseConfig } from "@/lib/env";

export function createClient() {
  assertSupabaseConfig();

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
