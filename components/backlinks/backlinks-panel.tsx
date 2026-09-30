import Link from "next/link";
import { ChevronDown, FileText, Link2 } from "lucide-react";
import type { Backlink, BacklinksResult } from "@/lib/backlinks";

const MAX_LABELS = 3;

/**
 * "Links to this page" panel. Async so it can stream inside <Suspense> without
 * holding back the page; the data comes from `fetchBacklinks` (read-only).
 */
export async function BacklinksPanel({
  result,
  subject
}: {
  result: Promise<BacklinksResult>;
  /** Wording for the heading, e.g. "cette page" or "ce document". */
  subject: string;
}) {
  const { items, incomplete } = await result;
  const heading = `Liens vers ${subject}`;

  if (items.length === 0) {
    return (
      <section
        id="backlinks"
        aria-label={heading}
        className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]"
      >
        <Link2 aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span>{incomplete ? `Impossible de vérifier tous les liens vers ${subject}.` : `Aucun lien vers ${subject}.`}</span>
      </section>
    );
  }

  return (
    <section id="backlinks" aria-labelledby="backlinks-heading" className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <details open className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] [&::-webkit-details-marker]:hidden">
          <Link2 aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--accent)]" />
          <h2 id="backlinks-heading" className="font-semibold">{heading}</h2>
          <span className="rounded-full bg-[var(--surface-elevated)] px-2 py-0.5 text-xs font-medium text-[var(--muted)]">{items.length}</span>
          <ChevronDown aria-hidden="true" className="ml-auto h-4 w-4 shrink-0 text-[var(--muted)] transition-transform group-open:rotate-180" />
        </summary>

        <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {items.map((item) => (
            <li key={`${item.type}-${item.id}`}>
              <BacklinkRow item={item} />
            </li>
          ))}
        </ul>

        {incomplete ? (
          <p className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">
            La liste peut être incomplète : certains contenus n&apos;ont pas pu être analysés.
          </p>
        ) : null}
      </details>
    </section>
  );
}

function BacklinkRow({ item }: { item: Backlink }) {
  const shown = item.labels.slice(0, MAX_LABELS);
  const hidden = item.labels.length - shown.length;

  return (
    <Link
      href={item.href}
      className="flex items-start gap-3 px-3 py-2 transition hover:bg-[var(--surface-elevated)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-sm">
        {item.type === "page" ? (item.icon ?? "📄") : <FileText className="h-4 w-4 text-[var(--accent)]" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium" title={item.title}>{item.title}</span>
          <span className="shrink-0 text-[11px] uppercase tracking-wide text-[var(--muted)]">
            {item.type === "page" ? "Page" : (item.context ?? "Document")}
          </span>
        </span>
        {shown.length > 0 ? (
          <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
            {shown.map((label) => `« ${label} »`).join(" · ")}
            {hidden > 0 ? ` · +${hidden}` : ""}
          </span>
        ) : null}
      </span>
      {item.count > 1 ? <span className="shrink-0 text-xs text-[var(--muted)]">{item.count} liens</span> : null}
    </Link>
  );
}

export function BacklinksSkeleton() {
  return <div aria-hidden="true" className="h-11 animate-pulse rounded-lg border border-[var(--border)] bg-[var(--surface)]" />;
}
