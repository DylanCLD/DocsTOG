import type { ReactNode } from "react";
import Link from "next/link";

export type SubItem = {
  id: string;
  title: string;
  href: string;
  icon?: ReactNode;
};

/** Direct children of the current page or document, shown right under its title. */
export function SubItemsList({ label, items }: { label: string; items: SubItem[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav aria-label={label} className="flex max-h-24 flex-wrap items-center gap-1.5 overflow-y-auto">
      <span className="mr-1 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        {label} <span className="font-normal">({items.length})</span>
      </span>
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          title={item.title}
          className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--muted)] transition hover:border-[var(--accent-border)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          {item.icon ? <span aria-hidden="true" className="shrink-0">{item.icon}</span> : null}
          <span className="truncate">{item.title}</span>
        </Link>
      ))}
    </nav>
  );
}
