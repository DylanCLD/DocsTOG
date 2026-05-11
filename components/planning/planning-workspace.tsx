"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LayoutGrid,
  List,
  Plus
} from "lucide-react";
import {
  createPlanningSession,
  deletePlanningSession,
  updatePlanningSession
} from "@/lib/actions/planning";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteButton } from "@/components/ui/delete-button";
import { ActionForm } from "@/components/ui/action-form";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { UserMultiSelect } from "@/components/ui/user-multi-select";
import { cn, formatDate } from "@/lib/utils";
import type { PlanningSession, Profile, SessionStatus } from "@/types";
import { SESSION_STATUS_LABELS } from "@/types";

type UserOption = Pick<Profile, "id" | "email" | "full_name" | "avatar_url">;
type PlanningView = "list" | "calendar" | "cards";
type PlanningScope = "upcoming" | "all" | "archived";

const statusTones = {
  planned: "accent",
  in_progress: "green",
  done: "neutral",
  cancelled: "red"
} as const;

const weekDays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function PlanningWorkspace({
  sessions,
  users,
  canWrite,
  canDelete
}: {
  sessions: PlanningSession[];
  users: UserOption[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const [view, setView] = useState<PlanningView>("list");
  const [statusFilter, setStatusFilter] = useState<"all" | SessionStatus>("all");
  const [scope, setScope] = useState<PlanningScope>("upcoming");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const todayKey = getDateKey(new Date());

  const statusCounts = useMemo(() => {
    const counts = new Map<SessionStatus, number>();
    sessions.forEach((session) => counts.set(session.status, (counts.get(session.status) ?? 0) + 1));
    return counts;
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      const isArchived = session.status === "done" || session.status === "cancelled" || session.session_date < todayKey;
      const matchesScope =
        scope === "all" ||
        (scope === "upcoming" && !isArchived) ||
        (scope === "archived" && isArchived);

      return matchesScope && (statusFilter === "all" || session.status === statusFilter);
    });
  }, [scope, sessions, statusFilter, todayKey]);

  const nextSession = useMemo(() => {
    return sessions.find((session) => session.session_date >= todayKey && ["planned", "in_progress"].includes(session.status));
  }, [sessions, todayKey]);

  const calendarCells = useMemo(() => buildCalendarCells(calendarMonth, filteredSessions), [calendarMonth, filteredSessions]);
  const monthLabel = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(calendarMonth);
  const upcomingCount = sessions.filter((session) => session.session_date >= todayKey && ["planned", "in_progress"].includes(session.status)).length;

  const moveMonth = (offset: number) => {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  return (
    <div className="space-y-5">
      {canWrite && (
        <details className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <summary className="cursor-pointer text-sm font-semibold">Créer une session vocale</summary>
          <SessionForm action={createPlanningSession} users={users} successMessage="Session créée." resetOnSuccess />
        </details>
      )}

      <section className="grid gap-3 md:grid-cols-3">
        <PlanningSummaryCard label="À venir" value={upcomingCount} helper={nextSession ? `Prochaine: ${nextSession.title}` : "Aucune session planifiée"} />
        <PlanningSummaryCard label="En cours" value={statusCounts.get("in_progress") ?? 0} helper="Sessions actives à rejoindre ou terminer." />
        <PlanningSummaryCard label="Terminées" value={statusCounts.get("done") ?? 0} helper="Historique disponible dans les archives." />
      </section>

      <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {(["upcoming", "all", "archived"] as const).map((item) => (
              <Button key={item} variant={scope === item ? "primary" : "ghost"} size="sm" onClick={() => setScope(item)}>
                {item === "upcoming" ? "À venir" : item === "archived" ? "Archives" : "Tout"}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | SessionStatus)} className="h-9 min-w-40">
              <option value="all">Tous statuts</option>
              {Object.entries(SESSION_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label} ({statusCounts.get(value as SessionStatus) ?? 0})
                </option>
              ))}
            </Select>
            <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-1">
              <ViewButton label="Liste" active={view === "list"} onClick={() => setView("list")}>
                <List className="h-4 w-4" />
              </ViewButton>
              <ViewButton label="Calendrier" active={view === "calendar"} onClick={() => setView("calendar")}>
                <CalendarDays className="h-4 w-4" />
              </ViewButton>
              <ViewButton label="Cartes" active={view === "cards"} onClick={() => setView("cards")}>
                <LayoutGrid className="h-4 w-4" />
              </ViewButton>
            </div>
          </div>
        </div>
        <p className="text-sm text-[var(--muted)]">
          {filteredSessions.length} session{filteredSessions.length > 1 ? "s" : ""} affichée{filteredSessions.length > 1 ? "s" : ""}.
        </p>
      </div>

      {filteredSessions.length === 0 ? (
        <Card className="flex min-h-52 flex-col items-center justify-center p-8 text-center">
          <CalendarDays className="mb-3 h-8 w-8 text-[var(--accent)]" />
          <h3 className="font-semibold">Aucune session dans cette vue</h3>
          <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
            Change le filtre ou crée une première session pour cadrer les objectifs de l&apos;équipe.
          </p>
        </Card>
      ) : view === "list" ? (
        <section className="space-y-3">
          {filteredSessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              users={users}
              canWrite={canWrite}
              canDelete={canDelete}
              compact
            />
          ))}
        </section>
      ) : view === "cards" ? (
        <section className="grid gap-3 lg:grid-cols-2">
          {filteredSessions.map((session) => (
            <SessionCard key={session.id} session={session} users={users} canWrite={canWrite} canDelete={canDelete} />
          ))}
        </section>
      ) : (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
            <Button variant="ghost" size="icon" onClick={() => moveMonth(-1)} aria-label="Mois précédent">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-sm font-semibold capitalize">{monthLabel}</h2>
            <Button variant="ghost" size="icon" onClick={() => moveMonth(1)} aria-label="Mois suivant">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-[var(--muted)]">
            {weekDays.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
            {calendarCells.map((cell, index) =>
              cell ? (
                <div
                  key={cell.key}
                  className={cn(
                    "min-h-32 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3",
                    cell.key === todayKey && "border-[var(--accent)]"
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{cell.day}</p>
                    {cell.sessions.length > 0 && <span className="text-xs text-[var(--accent)]">{cell.sessions.length}</span>}
                  </div>
                  <div className="space-y-2">
                    {cell.sessions.map((session) => (
                      <div key={session.id} className="rounded-lg bg-[var(--surface-elevated)] p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate font-medium">{session.title}</p>
                          <Badge tone={statusTones[session.status]}>{SESSION_STATUS_LABELS[session.status]}</Badge>
                        </div>
                        <p className="mt-1 text-[var(--muted)]">{session.start_time}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div key={`empty-${index}`} className="hidden min-h-32 rounded-lg border border-transparent xl:block" />
              )
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function PlanningSummaryCard({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-2 line-clamp-1 text-xs text-[var(--muted)]">{helper}</p>
    </Card>
  );
}

function SessionCard({
  session,
  users,
  canWrite,
  canDelete,
  compact = false
}: {
  session: PlanningSession;
  users: UserOption[];
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
          {compact && session.objective && (
            <p className="mt-2 line-clamp-1 text-sm text-[var(--muted)]">{session.objective}</p>
          )}
          {!compact && (
            <div className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]">
              {session.objective && (
                <p>
                  <span className="font-medium text-[var(--text)]">Objectif:</span> {session.objective}
                </p>
              )}
              {session.description && <p>{session.description}</p>}
              {participants && (
                <p>
                  <span className="font-medium text-[var(--text)]">Participants:</span> {participants}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {session.voice_url && (
            <Button variant={session.status === "in_progress" ? "primary" : "secondary"} size="sm" asChildCompat>
              <a href={session.voice_url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Rejoindre
              </a>
            </Button>
          )}
          {canDelete && <DeleteButton action={deletePlanningSession.bind(null, session.id)} successMessage="Session supprimée." />}
        </div>
      </div>

      {canWrite && (
        <details className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
          <summary className="cursor-pointer text-sm font-medium">Modifier la session</summary>
          <SessionForm action={updatePlanningSession.bind(null, session.id)} session={session} users={users} successMessage="Session mise à jour." />
        </details>
      )}
    </Card>
  );
}

function SessionForm({
  action,
  users,
  session,
  successMessage,
  resetOnSuccess = false
}: {
  action: (formData: FormData) => Promise<void>;
  users: UserOption[];
  session?: PlanningSession;
  successMessage: string;
  resetOnSuccess?: boolean;
}) {
  const participants =
    session?.planning_session_participants
      ?.map((participant) => participant.users?.email ?? participant.participant_email ?? participant.participant_name)
      .filter((participant): participant is string => Boolean(participant)) ?? [];

  return (
    <ActionForm action={action} successMessage={successMessage} resetOnSuccess={resetOnSuccess} className="mt-4 grid gap-3 lg:grid-cols-2">
      <div>
        <Label htmlFor={`title-${session?.id ?? "new"}`}>Titre</Label>
        <Input id={`title-${session?.id ?? "new"}`} name="title" defaultValue={session?.title ?? ""} required />
      </div>
      <div>
        <Label htmlFor={`voice_url-${session?.id ?? "new"}`}>Lien Discord ou autre</Label>
        <Input
          id={`voice_url-${session?.id ?? "new"}`}
          name="voice_url"
          defaultValue={session?.voice_url ?? ""}
          placeholder="https://discord.gg/..."
        />
      </div>
      <div>
        <Label htmlFor={`session_date-${session?.id ?? "new"}`}>Date</Label>
        <Input
          id={`session_date-${session?.id ?? "new"}`}
          name="session_date"
          type="date"
          defaultValue={session?.session_date ?? ""}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`start_time-${session?.id ?? "new"}`}>Début</Label>
          <Input
            id={`start_time-${session?.id ?? "new"}`}
            name="start_time"
            type="time"
            defaultValue={session?.start_time ?? ""}
            required
          />
        </div>
        <div>
          <Label htmlFor={`end_time-${session?.id ?? "new"}`}>Fin</Label>
          <Input
            id={`end_time-${session?.id ?? "new"}`}
            name="end_time"
            type="time"
            defaultValue={session?.end_time ?? ""}
            required
          />
        </div>
      </div>
      <div>
        <Label htmlFor={`status-${session?.id ?? "new"}`}>Statut</Label>
        <Select id={`status-${session?.id ?? "new"}`} name="status" defaultValue={session?.status ?? "planned"}>
          {Object.entries(SESSION_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <UserMultiSelect name="participants" users={users} defaultEmails={participants} label="Participants" />
      </div>
      <div>
        <Label htmlFor={`objective-${session?.id ?? "new"}`}>Objectif</Label>
        <Textarea id={`objective-${session?.id ?? "new"}`} name="objective" defaultValue={session?.objective ?? ""} />
      </div>
      <div>
        <Label htmlFor={`description-${session?.id ?? "new"}`}>Description détaillée</Label>
        <Textarea
          id={`description-${session?.id ?? "new"}`}
          name="description"
          defaultValue={session?.description ?? ""}
        />
      </div>
      <div className="lg:col-span-2">
        <SubmitButton pendingLabel={session ? "Enregistrement..." : "Création..."}>
          <Plus className="h-4 w-4" />
          {session ? "Enregistrer" : "Créer la session"}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

function ViewButton({
  children,
  label,
  active,
  onClick
}: {
  children: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--text)]",
        active && "bg-[var(--surface-soft)] text-[var(--text)]"
      )}
    >
      {children}
    </button>
  );
}

function buildCalendarCells(month: Date, sessions: PlanningSession[]) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const startOffset = (first.getDay() + 6) % 7;
  const cells: Array<{ key: string; day: number; sessions: PlanningSession[] } | null> = [];

  for (let index = 0; index < startOffset; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= last.getDate(); day += 1) {
    const date = new Date(first.getFullYear(), first.getMonth(), day);
    const key = getDateKey(date);
    cells.push({
      key,
      day,
      sessions: sessions.filter((session) => session.session_date === key)
    });
  }

  return cells;
}

function getDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
