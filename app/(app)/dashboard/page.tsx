import Link from "next/link";
import { CalendarDays, FileText, FolderKanban, GalleryVerticalEnd, Plus, StickyNote } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { PageRecord, PlanningSession } from "@/types";

export default async function DashboardPage() {
  await requireProfile();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [pagesCount, docsCount, mediaCount, upcomingCount, latestPages, upcomingSessions] = await Promise.all([
    supabase.from("pages").select("id", { count: "exact", head: true }),
    supabase.from("documents").select("id", { count: "exact", head: true }),
    supabase.from("media_items").select("id", { count: "exact", head: true }),
    supabase
      .from("planning_sessions")
      .select("id", { count: "exact", head: true })
      .gte("session_date", today)
      .in("status", ["planned", "in_progress"]),
    supabase.from("pages").select("*").order("updated_at", { ascending: false }).limit(5),
    supabase
      .from("planning_sessions")
      .select("*")
      .gte("session_date", today)
      .in("status", ["planned", "in_progress"])
      .order("session_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(4)
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-medium text-[var(--accent)]">Vue globale</p>
          <h1 className="mt-1 text-3xl font-semibold">Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Pilote les pages, documents, sessions vocales et médias de ton projet depuis un seul endroit.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChildCompat>
            <Link href="/pages">
              <Plus className="h-4 w-4" />
              Nouvelle page
            </Link>
          </Button>
          <Button variant="secondary" asChildCompat>
            <Link href="/managers">Gestionnaires</Link>
          </Button>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={StickyNote} label="Pages créées" value={pagesCount.count ?? 0} helper="Pages de documentation libre." />
        <StatCard icon={FileText} label="Documents" value={docsCount.count ?? 0} helper="Documents dans les gestionnaires." />
        <StatCard icon={CalendarDays} label="Sessions à venir" value={upcomingCount.count ?? 0} helper="Sessions vocales prévues." />
        <StatCard icon={GalleryVerticalEnd} label="Médias" value={mediaCount.count ?? 0} helper="Images, vidéos et liens utiles." />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Dernières pages modifiées</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">Reprends vite les notes actives de l’équipe.</p>
              </div>
              <Link href="/pages" className="text-sm font-medium text-[var(--accent)]">
                Tout voir
              </Link>
            </div>
          </CardHeader>
          <CardContent className="divide-y divide-[var(--border)] p-0">
            {((latestPages.data ?? []) as PageRecord[]).map((page) => (
              <Link key={page.id} href={`/pages/${page.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--surface-elevated)]">
                <span className="text-xl">{page.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{page.title}</p>
                  <p className="text-xs text-[var(--muted)]">{page.category} · {formatDateTime(page.updated_at)}</p>
                </div>
              </Link>
            ))}
            {(latestPages.data?.length ?? 0) === 0 && <p className="p-4 text-sm text-[var(--muted)]">Aucune page pour le moment.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold">Prochaines sessions</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Planning vocal de l’équipe.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {((upcomingSessions.data ?? []) as PlanningSession[]).map((session) => (
              <Link key={session.id} href="/planning" className="block rounded-lg border border-[var(--border)] p-3 transition hover:bg-[var(--surface-elevated)]">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{session.title}</p>
                  <Badge tone={session.status === "in_progress" ? "green" : "accent"}>{session.status === "in_progress" ? "En cours" : "Prévue"}</Badge>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {formatDate(session.session_date)} · {session.start_time} - {session.end_time}
                </p>
              </Link>
            ))}
            {(upcomingSessions.data?.length ?? 0) === 0 && <p className="text-sm text-[var(--muted)]">Aucune session programmée.</p>}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Link href="/managers" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:bg-[var(--surface-elevated)]">
          <FolderKanban className="mb-4 h-5 w-5 text-[var(--accent)]" />
          <h3 className="font-semibold">Structurer les systèmes</h3>
          <p className="mt-2 text-sm text-[var(--muted)]">Crée des gestionnaires pour le lore, gameplay, bugs et équilibrage.</p>
        </Link>
        <Link href="/planning" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:bg-[var(--surface-elevated)]">
          <CalendarDays className="mb-4 h-5 w-5 text-[var(--accent)]" />
          <h3 className="font-semibold">Organiser une vocale</h3>
          <p className="mt-2 text-sm text-[var(--muted)]">Planifie une session avec objectif, participants et lien Discord.</p>
        </Link>
        <Link href="/media" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:bg-[var(--surface-elevated)]">
          <GalleryVerticalEnd className="mb-4 h-5 w-5 text-[var(--accent)]" />
          <h3 className="font-semibold">Centraliser les médias</h3>
          <p className="mt-2 text-sm text-[var(--muted)]">Garde les images, vidéos, références et liens utiles au même endroit.</p>
        </Link>
      </section>
    </div>
  );
}
