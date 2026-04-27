import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { parseCommaList } from "@/lib/utils";
import type { Profile, UserRole } from "@/types";

export function getBootstrapAdminEmails() {
  return parseCommaList(process.env.BOOTSTRAP_ADMIN_EMAILS);
}

export async function getCurrentProfile() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return null;
  }

  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return (data as Profile | null) ?? null;
}

export async function requireProfile() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!data) {
    redirect("/access-denied");
  }

  return data as Profile;
}

export async function requireAdmin() {
  const profile = await requireProfile();

  if (profile.role !== "admin") {
    redirect("/access-denied");
  }

  return profile;
}

export function canWrite(role: UserRole) {
  return role === "admin" || role === "member";
}

export function canDelete(role: UserRole) {
  return role === "admin";
}

export async function ensureUserFromOAuth(input: {
  id: string;
  email: string;
  fullName?: string | null;
  avatarUrl?: string | null;
}) {
  const admin = createAdminClient();
  const email = input.email.toLowerCase();
  const bootstrapAdmins = getBootstrapAdminEmails();
  const isBootstrapAdmin = bootstrapAdmins.includes(email);

  if (isBootstrapAdmin) {
    await admin.from("allowed_emails").upsert(
      {
        email,
        role: "admin",
        is_active: true
      },
      {
        onConflict: "email"
      }
    );
  }

  const { data: allowedEmail } = await admin
    .from("allowed_emails")
    .select("*")
    .eq("email", email)
    .eq("is_active", true)
    .maybeSingle();

  if (!allowedEmail) {
    return { allowed: false as const, role: null };
  }

  await admin.from("users").upsert(
    {
      id: input.id,
      email,
      full_name: input.fullName ?? null,
      avatar_url: input.avatarUrl ?? null,
      role: allowedEmail.role,
      last_seen_at: new Date().toISOString()
    },
    {
      onConflict: "id"
    }
  );

  return {
    allowed: true as const,
    role: allowedEmail.role as UserRole
  };
}
