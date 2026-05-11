"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, FileText, Grid2X2, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { DocumentManager } from "@/types";

type ManagerWithCount = DocumentManager & {
  documents?: Array<{ count: number }>;
};

export function ManagersListClient({ managers }: { managers: ManagerWithCount[] }) {
  const [view, setView] = useState<"cards" | "list">("list");

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => setView(view === "cards" ? "list" : "cards")}>
          {view === "cards" ? <List className="h-4 w-4" /> : <Grid2X2 className="h-4 w-4" />}
          {view === "cards" ? "Liste" : "Cartes"}
        </Button>
      </div>

      {view === "cards" ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {managers.map((manager) => {
            const documentCount = manager.documents?.[0]?.count ?? 0;
            return (
              <Link key={manager.id} href={`/managers/${manager.id}`}>
                <Card className="flex h-full flex-col justify-between p-4 transition hover:-translate-y-0.5 hover:bg-[var(--surface-elevated)]">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{manager.icon}</span>
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold">{manager.name}</h2>
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--muted)]">
                        {manager.description ?? "Gestionnaire de documents projet."}
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 inline-flex w-fit items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-1 text-xs font-medium text-[var(--muted)]">
                    <FileText className="h-3.5 w-3.5 text-[var(--accent)]" />
                    {documentCount} document{documentCount > 1 ? "s" : ""}
                  </div>
                </Card>
              </Link>
            );
          })}
        </section>
      ) : (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
          {managers.map((manager) => {
            const documentCount = manager.documents?.[0]?.count ?? 0;
            return (
              <Link
                key={manager.id}
                href={`/managers/${manager.id}`}
                className="flex items-center gap-4 px-4 py-3 transition hover:bg-[var(--surface-elevated)]"
              >
                <span className="text-xl shrink-0">{manager.icon}</span>
                <div className="min-w-0 flex-1">
                  <span className="font-semibold truncate block">{manager.name}</span>
                  {manager.description && (
                    <span className="text-xs text-[var(--muted)] truncate block mt-0.5">
                      {manager.description}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-[var(--muted)]">
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-[var(--accent)]" />
                    {documentCount} doc{documentCount > 1 ? "s" : ""}
                  </span>
                  <ChevronRight className="h-4 w-4 text-[var(--border)]" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
