"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchWorkspace } from "@/lib/actions/search";

type SearchResult = {
  id: string;
  title: string;
  type: "page" | "document" | "media" | "session";
  href: string;
  subtitle: string | null;
};

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isPending, startTransition] = useTransition();

  const label = useMemo(() => {
    if (!query.trim()) {
      return "Recherche globale";
    }

    if (isPending) {
      return "Recherche...";
    }

    return `${results.length} résultat${results.length > 1 ? "s" : ""}`;
  }, [isPending, query, results.length]);

  return (
    <div className="relative w-full max-w-2xl">
      <Input
        value={query}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          startTransition(async () => {
            if (nextQuery.trim().length < 2) {
              setResults([]);
              return;
            }

            setResults(await searchWorkspace(nextQuery));
          });
        }}
        placeholder="Rechercher pages, documents, médias, sessions..."
        className="pl-9"
      />
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
      <span className="sr-only">{label}</span>

      {query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-12 z-30 max-h-96 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-2xl shadow-black/30">
          {results.length === 0 ? (
            <p className="px-3 py-4 text-sm text-[var(--muted)]">
              {isPending ? "Recherche en cours..." : "Aucun résultat trouvé."}
            </p>
          ) : (
            results.map((result) => (
              <Link
                key={`${result.type}-${result.id}`}
                href={result.href}
                onClick={() => setQuery("")}
                className="block rounded-lg px-3 py-2 transition hover:bg-[var(--surface-elevated)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-medium">{result.title}</p>
                  <span className="rounded-full bg-[var(--surface-elevated)] px-2 py-0.5 text-[10px] uppercase text-[var(--muted)]">
                    {result.type}
                  </span>
                </div>
                {result.subtitle && <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{result.subtitle}</p>}
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
