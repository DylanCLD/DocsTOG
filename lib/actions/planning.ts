"use server";

import { revalidatePath } from "next/cache";
import { canDelete, canWrite, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  formString,
  nullableString,
  parseParticipantsInput,
  planningSessionSchema
} from "@/lib/validation";

export async function createPlanningSession(formData: FormData) {
  const profile = await requireProfile();
  if (!canWrite(profile.role)) {
    throw new Error("Permission refusée.");
  }

  const parsed = planningSessionSchema.parse({
    title: formString(formData, "title"),
    session_date: formString(formData, "session_date"),
    start_time: formString(formData, "start_time"),
    end_time: formString(formData, "end_time"),
    description: nullableString(formString(formData, "description")),
    objective: nullableString(formString(formData, "objective")),
    voice_url: nullableString(formString(formData, "voice_url")),
    status: formString(formData, "status") || "planned",
    participants: formString(formData, "participants")
  });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("planning_sessions")
    .insert({
      title: parsed.title,
      session_date: parsed.session_date,
      start_time: parsed.start_time,
      end_time: parsed.end_time,
      description: parsed.description,
      objective: parsed.objective,
      voice_url: parsed.voice_url,
      status: parsed.status,
      created_by: profile.id,
      updated_by: profile.id
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await replaceParticipants(data.id, parsed.participants);
  revalidatePath("/planning");
  revalidatePath("/dashboard");
}

export async function updatePlanningSession(sessionId: string, formData: FormData) {
  const profile = await requireProfile();
  if (!canWrite(profile.role)) {
    throw new Error("Permission refusée.");
  }

  const parsed = planningSessionSchema.parse({
    title: formString(formData, "title"),
    session_date: formString(formData, "session_date"),
    start_time: formString(formData, "start_time"),
    end_time: formString(formData, "end_time"),
    description: nullableString(formString(formData, "description")),
    objective: nullableString(formString(formData, "objective")),
    voice_url: nullableString(formString(formData, "voice_url")),
    status: formString(formData, "status") || "planned",
    participants: formString(formData, "participants")
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from("planning_sessions")
    .update({
      title: parsed.title,
      session_date: parsed.session_date,
      start_time: parsed.start_time,
      end_time: parsed.end_time,
      description: parsed.description,
      objective: parsed.objective,
      voice_url: parsed.voice_url,
      status: parsed.status,
      updated_by: profile.id
    })
    .eq("id", sessionId);

  if (error) {
    throw new Error(error.message);
  }

  await replaceParticipants(sessionId, parsed.participants);
  revalidatePath("/planning");
  revalidatePath("/dashboard");
}

export async function deletePlanningSession(sessionId: string) {
  const profile = await requireProfile();
  if (!canDelete(profile.role)) {
    throw new Error("Seuls les admins peuvent supprimer.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("planning_sessions").delete().eq("id", sessionId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/planning");
  revalidatePath("/dashboard");
}

async function replaceParticipants(sessionId: string, participants?: string) {
  const supabase = await createClient();
  const entries = parseParticipantsInput(participants);
  await supabase.from("planning_session_participants").delete().eq("session_id", sessionId);

  if (entries.length === 0) {
    return;
  }

  await supabase.from("planning_session_participants").insert(
    entries.map((entry) => ({
      session_id: sessionId,
      participant_email: entry.includes("@") ? entry.toLowerCase() : null,
      participant_name: entry.includes("@") ? null : entry
    }))
  );
}
