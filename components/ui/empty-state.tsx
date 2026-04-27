import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export function EmptyState({
  icon: Icon,
  title,
  description
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Card className="flex min-h-52 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--accent)]">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-1 max-w-md text-sm text-[var(--muted)]">{description}</p>
      </div>
    </Card>
  );
}
