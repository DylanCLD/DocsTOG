"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { allowedEmailSchema, formString, nullableString, roleSchema, workspaceSettingsSchema } from "@/lib/validation";

export async function addAllowedEmail(formData: FormData) {
  const profile = await requireAdmin();
  const parsed = allowedEmailSchema.parse({
    email: formString(formData, "email"),
    role: formString(formData, "role") || "member"
  });

  const supabase = await createClient();
  const { error } = await supabase.from("allowed_emails").upsert(
    {
      email: parsed.email,
      role: parsed.role,
      is_active: true,
      invited_by: profile.id
    },
    {
      onConflict: "email"
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/settings");
}

export async function updateAllowedEmail(emailId: string, formData: FormData) {
  await requireAdmin();
  const parsed = allowedEmailSchema.parse({
    email: formString(formData, "email"),
    role: formString(formData, "role") || "member"
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from("allowed_emails")
    .update({
      email: parsed.email,
      role: parsed.role,
      is_active: formString(formData, "is_active") === "on"
    })
    .eq("id", emailId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/settings");
}

export async function updateUserRole(userId: string, formData: FormData) {
  await requireAdmin();
  const role = roleSchema.parse(formString(formData, "role") || "reader");

  const supabase = await createClient();
  const { error } = await supabase.from("users").update({ role }).eq("id", userId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/settings");
}

export async function updateWorkspaceSettings(formData: FormData) {
  const profile = await requireAdmin();
  const parsed = workspaceSettingsSchema.parse({
    project_name: formString(formData, "project_name"),
    logo_url: nullableString(formString(formData, "logo_url")),
    theme: formString(formData, "theme") || "dark"
  });

  const supabase = await createClient();
  const { error } = await supabase.from("workspace_settings").upsert(
    {
      id: true,
      project_name: parsed.project_name,
      logo_url: parsed.logo_url,
      theme: parsed.theme,
      updated_by: profile.id
    },
    {
      onConflict: "id"
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
}
