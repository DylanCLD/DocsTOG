import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type BreadcrumbItem = {
  label: string;
  /** Omit on the current item. */
  href?: string;
  icon?: ReactNode;
};

/**
 * Clickable trail from the section root down to the current item.
 * Long titles are truncated visually but stay complete in the accessible name
 * and in the native tooltip.
 */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Fil d'Ariane" className="min-w-0">
      <ol className="flex flex-wrap items-center gap-y-0.5 text-xs text-[var(--muted)]">
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;
          const content = (
            <>
              {item.icon ? <span aria-hidden="true" className="shrink-0">{item.icon}</span> : null}
              <span className="truncate">{item.label}</span>
            </>
          );

          return (
            <li key={`${index}-${item.href ?? item.label}`} className="flex min-w-0 items-center">
              {index > 0 ? <ChevronRight aria-hidden="true" className="mx-0.5 h-3 w-3 shrink-0 opacity-60" /> : null}
              {item.href && !isCurrent ? (
                <Link
                  href={item.href}
                  title={item.label}
                  className="flex max-w-[12rem] items-center gap-1 rounded px-1 py-0.5 transition hover:bg-[var(--surface-elevated)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                >
                  {content}
                </Link>
              ) : (
                <span
                  aria-current={isCurrent ? "page" : undefined}
                  title={item.label}
                  className="flex max-w-[20rem] items-center gap-1 px-1 py-0.5 font-medium text-[var(--text)]"
                >
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
