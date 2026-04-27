"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ExternalLink, Plus } from "lucide-react";
import {
  createPlanningSession,
  deletePlanningSession,
  updatePlanningSession
} from "@/lib/actions/planning";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteButton } from "@/components/ui/delete-button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import type { PlanningSession } from "@/types";
import { SESSION_STATUS_LABELS } from "@/types";

const statusTones = {
  planned: "accent",
  in_progress: "green",
  done: "neutral",
  cancelled: "red"
} as const;

export function PlanningWorkspace({
  sessions,
  canWrite,
  canDelete
}: {
  sessions: PlanningSession[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const [view, setView] = useState<"list" | "calendar" | "cards">("list");

  const calendarDays = useMemo(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const days = [];
    for (let day = 1; day <= last.getDate(); day += 1) {
      const date = new Date(first.getFullYear(), first.getMonth(), day);
      const key = date.toISOString().slice(0, 10);
      days.push({
        key,
        day,
        sessions: sessions.filter((session) => session.session_date === key)
      });
    }
    return days;
  }, [sessions]);

  return (
    <div className="space-y-5">
      {canWrite && (
        <details className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <summary className="cursor-pointer text-sm font-semibold">Créer une session vocale</summary>
          <SessionForm action={createPlanningSession} />
        </details>
      )}

      <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
        {(["list", "calendar", "cards"] as const).map((mode) => (
          <Button key={mode} variant={view === mode ? "primary" : "ghost"} size="sm" onClick={() => setView(mode)}>
            {mode === "list" ? "Liste chronologique" : mode === "calendar" ? "Calendrier" : "Cartes"}
          </Button>
        ))}
      </div>

      {view === "list" && (
        <section className="space-y-3">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              canWrite={canWrite}
              canDelete={canDelete}
              compact
            />
          ))}
        </section>
      )}

      {view === "cards" && (
        <section className="grid gap-3 lg:grid-cols-2">
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} canWrite={canWrite} canDelete={canDelete} />
          ))}
        </section>
      )}

      {view === "calendar" && (
        <section className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
          {calendarDays.map((day) => (
            <div key={day.key} className="min-h-32 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className="mb-2 text-sm font-semibold">{day.day}</p>
              <div className="space-y-2">
                {day.sessions.map((session) => (
                  <div key={session.id} className="rounded-lg bg-[var(--surface-elevated)] p-2 text-xs">
                    <p className="font-medium">{session.title}</p>
                    <p className="mt-1 text-[var(--muted)]">{session.start_time}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {sessions.length === 0 && (
        <Card className="flex min-h-52 flex-col items-center justify-center p-8 text-center">
          <CalendarDays className="mb-3 h-8 w-8 text-[var(--accent)]" />
          <h3 className="font-semibold">Aucune session vocale</h3>
          <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
            Ajoute une première session pour cadrer les objectifs de l’équipe.
          </p>
        </Card>
      )}
    </div>
  );
}

function SessionCard({
  session,
  canWrite,
  canDelete,
  compact = false
}: {
  session: PlanningSession;
  canWrite: boolean;
  canDelete: boolean;
  compact?: boolean;
}) {
  const participants =
    session.planning_session_participants
      ?.map((participant) => participant.users?.full_name ?? participant.participant_name ?? participant.participant_email)
      .filter(Boolean)
      .join(", ") ?? "";

  return (
    <Card className="p-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{session.title}</h2>
            <Badge tone={statusTones[session.status]}>{SESSION_STATUS_LABELS[session.status]}</Badge>
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {formatDate(session.session_date)} · {session.start_time} - {session.end_time}
          </p>
          {!compact && (
            <div className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]">
              {session.objective && <p><span className="font-medium text-[var(--text)]">Objectif:</span> {session.objective}</p>}
              {session.description && <p>{session.description}</p>}
              {participants && <p><span className="font-medium text-[var(--text)]">Participants:</span> {participants}</p>}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {session.voice_url && (
            <Button variant="secondary" size="sm" asChildCompat>
              <a href={session.voice_url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Lien
              </a>
            </Button>
          )}
          {canDelete && <DeleteButton action={deletePlanningSession.bind(null, session.id)} />}
        </div>
      </div>

      {canWrite && (
        <details className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
          <summary className="cursor-pointer text-sm font-medium">Modifier la session</summary>
          <SessionForm action={updatePlanningSession.bind(null, session.id)} session={session} />
        </details>
      )}
    </Card>
  );
}

function SessionForm({
  action,
  session
}: {
  action: (formData: FormData) => Promise<void>;
  session?: PlanningSession;
}) {
  const participants =
    session?.planning_session_participants
      ?.map((participant) => participant.users?.email ?? participant.participant_email ?? participant.participant_name)
      .filter(Boolean)
      .join(", ") ?? "";

  return (
    <form action={action} className="mt-4 grid gap-3 lg:grid-cols-2">
      <div>
        <Label htmlFor={`title-${session?.id ?? "new"}`}>Titre</Label>
        <Input id={`title-${session?.id ?? "new"}`} name="title" defaultValue={session?.title ?? ""} required />
      </div>
      <div>
        <Label htmlFor={`voice_url-${session?.id ?? "new"}`}>Lien Discord ou autre</Label>
        <Input id={`voice_url-${session?.id ?? "new"}`} name="voice_url" defaultValue={session?.voice_url ?? ""} placeholder="https://discord.gg/..." />
      </div>
      <div>
        <Label htmlFor={`session_date-${session?.id ?? "new"}`}>Date</Label>
        <Input id={`session_date-${session?.id ?? "new"}`} name="session_date" type="date" defaultValue={session?.session_date ?? ""} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`start_time-${session?.id ?? "new"}`}>Début</Label>
          <Input id={`start_time-${session?.id ?? "new"}`} name="start_time" type="time" defaultValue={session?.start_time ?? ""} required />
        </div>
        <div>
          <Label htmlFor={`end_time-${session?.id ?? "new"}`}>Fin</Label>
          <Input id={`end_time-${session?.id ?? "new"}`} name="end_time" type="time" defaultValue={session?.end_time ?? ""} required />
        </div>
      </div>
      <div>
        <Label htmlFor={`status-${session?.id ?? "new"}`}>Statut</Label>
        <Select id={`status-${session?.id ?? "new"}`} name="status" defaultValue={session?.status ?? "planned"}>
          {Object.entries(SESSION_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor={`participants-${session?.id ?? "new"}`}>Participants</Label>
        <Input id={`participants-${session?.id ?? "new"}`} name="participants" defaultValue={participants} placeholder="Nom ou email, séparés par virgules" />
      </div>
      <div>
        <Label htmlFor={`objective-${session?.id ?? "new"}`}>Objectif</Label>
        <Textarea id={`objective-${session?.id ?? "new"}`} name="objective" defaultValue={session?.objective ?? ""} />
      </div>
      <div>
        <Label htmlFor={`description-${session?.id ?? "new"}`}>Description détaillée</Label>
        <Textarea id={`description-${session?.id ?? "new"}`} name="description" defaultValue={session?.description ?? ""} />
      </div>
      <div className="lg:col-span-2">
        <Button type="submit">
          <Plus className="h-4 w-4" />
          {session ? "Enregistrer" : "Créer la session"}
        </Button>
      </div>
    </form>
  );
}
