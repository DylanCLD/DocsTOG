import { PlanningWorkspace } from "@/components/planning/planning-workspace";
import { canDelete, canWrite, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { PlanningSession } from "@/types";

export default async function PlanningPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("planning_sessions")
    .select("*, planning_session_participants(*, users:user_id(id,email,full_name,avatar_url))")
    .order("session_date", { ascending: true })
    .order("start_time", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-[var(--accent)]">Coordination équipe</p>
        <h1 className="mt-1 text-3xl font-semibold">Planning vocal</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Planifie les réunions vocales avec objectifs, participants, lien Discord et statut.
        </p>
      </div>

      <PlanningWorkspace
        sessions={(data ?? []) as PlanningSession[]}
        canWrite={canWrite(profile.role)}
        canDelete={canDelete(profile.role)}
      />
    </div>
  );
}
