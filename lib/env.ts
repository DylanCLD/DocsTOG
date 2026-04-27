export function hasSupabaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function hasSupabaseAdminConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function assertSupabaseConfig() {
  if (!hasSupabaseConfig()) {
    throw new Error("Supabase configuration is missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
}

export function assertSupabaseAdminConfig() {
  if (!hasSupabaseAdminConfig()) {
    throw new Error("Supabase admin configuration is missing. Set SUPABASE_SERVICE_ROLE_KEY.");
  }
}
