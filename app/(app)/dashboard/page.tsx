import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  FileText,
  GalleryVerticalEnd,
  Plus,
  StickyNote
} from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { DocumentManager, DocumentRecord, MediaItem, PageRecord, PlanningSession } from "@/types";
import { MEDIA_TYPE_LABELS, PRIORITY_LABELS, STATUS_LABELS } from "@/types";

type DashboardDocument = Pick<
  DocumentRecord,
  "id" | "title" | "short_description" | "status" | "priority" | "updated_at"
> & {
  document_managers?: Pick<DocumentManager, "name" | "icon"> | Array<Pick<DocumentManager, "name" | "icon">> | null;
};

export default async function DashboardPage() {
  await requireProfile();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    pagesCount,
    docsCount,
    mediaCount,
    upcomingCount,
    openDocsCount,
    latestPages,
    latestDocuments,
    attentionDocuments,
    latestMedia,
    upcomingSessions
  ] = await Promise.all([
    supabase.from("pages").select("id", { count: "exact", head: true }),
    supabase.from("documents").select("id", { count: "exact", head: true }),
    supabase.from("media_items").select("id", { count: "exact", head: true }),
    supabase
      .from("planning_sessions")
      .select("id", { count: "exact", head: true })
      .gte("session_date", today)
      .in("status", ["planned", "in_progress"]),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .in("status", ["todo", "review"]),
    supabase.from("pages").select("*").order("updated_at", { ascending: false }).limit(5),
    supabase
      .from("documents")
      .select("id,title,short_description,status,priority,updated_at,document_managers(name,icon)")
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("documents")
      .select("id,title,short_description,status,priority,updated_at,document_managers(name,icon)")
      .in("status", ["todo", "review"])
      .order("updated_at", { ascending: true })
      .limit(4),
    supabase
      .from("media_items")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(4),
    supabase
      .from("planning_sessions")
      .select("*")
      .gte("session_date", today)
      .in("status", ["planned", "in_progress"])
      .order("session_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(4)
  ]);

  const pages = (latestPages.data ?? []) as PageRecord[];
  const documents = (latestDocuments.data ?? []) as DashboardDocument[];
  const docsToReview = (attentionDocuments.data ?? []) as DashboardDocument[];
  const mediaItems = (latestMedia.data ?? []) as MediaItem[];
  const sessions = (upcomingSessions.data ?? []) as PlanningSession[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-medium text-[var(--accent)]">Vue globale</p>
          <h1 className="mt-1 text-3xl font-semibold">Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Reprends les contenus actifs, les points à traiter et les prochaines sessions sans chercher dans chaque section.
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Link href="/pages" className="transition hover:opacity-80">
          <StatCard icon={StickyNote} label="Pages" value={pagesCount.count ?? 0} helper="Documentation libre." />
        </Link>
        <Link href="/managers" className="transition hover:opacity-80">
          <StatCard icon={FileText} label="Documents" value={docsCount.count ?? 0} helper="Dans les gestionnaires." />
        </Link>
        <Link href="/managers" className="transition hover:opacity-80">
          <StatCard icon={AlertCircle} label="À reprendre" value={openDocsCount.count ?? 0} helper="À faire ou à revoir." />
        </Link>
        <Link href="/planning" className="transition hover:opacity-80">
          <StatCard icon={CalendarDays} label="Sessions" value={upcomingCount.count ?? 0} helper="À venir." />
        </Link>
        <Link href="/media" className="transition hover:opacity-80">
          <StatCard icon={GalleryVerticalEnd} label="Médias" value={mediaCount.count ?? 0} helper="Références et liens." />
        </Link>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Reprendre le travail</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">Dernières pages et documents modifiés.</p>
              </div>
              <Link href="/pages" className="inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)]">
                Tout voir
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="grid gap-0 p-0 md:grid-cols-2 md:divide-x md:divide-[var(--border)]">
            <div className="divide-y divide-[var(--border)]">
              {pages.map((page) => (
                <Link key={page.id} href={`/pages/${page.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--surface-elevated)]">
                  <span className="text-xl">{page.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{page.title}</p>
                    <p className="truncate text-xs text-[var(--muted)]">{page.category} · {formatDateTime(page.updated_at)}</p>
                  </div>
                </Link>
              ))}
              {pages.length === 0 && <p className="p-4 text-sm text-[var(--muted)]">Aucune page pour le moment.</p>}
            </div>
            <div className="divide-y divide-[var(--border)]">
              {documents.map((document) => (
                <Link key={document.id} href={`/documents/${document.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--surface-elevated)]">
                  <span className="text-lg">{documentManager(document)?.icon ?? "📄"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{document.title}</p>
                    <p className="truncate text-xs text-[var(--muted)]">
                      {documentManager(document)?.name ?? "Document"} · {formatDateTime(document.updated_at)}
                    </p>
                  </div>
                </Link>
              ))}
              {documents.length === 0 && <p className="p-4 text-sm text-[var(--muted)]">Aucun document pour le moment.</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold">À suivre</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Documents qui demandent une décision ou une passe de finition.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {docsToReview.map((document) => (
              <Link key={document.id} href={`/documents/${document.id}`} className="block rounded-lg border border-[var(--border)] p-3 transition hover:bg-[var(--surface-elevated)]">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 truncate font-medium">{document.title}</p>
                  <Badge tone={document.status === "review" ? "red" : "accent"}>{STATUS_LABELS[document.status]}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                  <span>{documentManager(document)?.name ?? "Document"}</span>
                  <span>·</span>
                  <span>{PRIORITY_LABELS[document.priority]}</span>
                </div>
              </Link>
            ))}
            {docsToReview.length === 0 && <p className="text-sm text-[var(--muted)]">Rien d&apos;urgent à reprendre.</p>}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Prochaines sessions</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Planning vocal de l&apos;équipe.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {sessions.map((session) => (
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
            {sessions.length === 0 && <p className="text-sm text-[var(--muted)]">Aucune session programmée.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Médias récents</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">Dernières références ajoutées à la bibliothèque.</p>
              </div>
              <Link href="/media" className="inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)]">
                Ouvrir
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {mediaItems.map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-[var(--border)] p-3 transition hover:bg-[var(--surface-elevated)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-medium">{item.title}</p>
                  <Badge tone="accent">{MEDIA_TYPE_LABELS[item.type]}</Badge>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{item.description ?? item.url}</p>
              </a>
            ))}
            {mediaItems.length === 0 && <p className="text-sm text-[var(--muted)]">Aucun média pour le moment.</p>}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function documentManager(document: DashboardDocument) {
  return Array.isArray(document.document_managers) ? document.document_managers[0] : document.document_managers;
}
