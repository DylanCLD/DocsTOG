import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/utils";
import { PRIORITY_LABELS, STATUS_LABELS, type DocumentPriority, type DocumentStatus, type Profile, type Tag } from "@/types";

const statusTones: Record<DocumentStatus, "neutral" | "accent" | "amber" | "green"> = {
  todo: "neutral",
  in_progress: "accent",
  review: "amber",
  done: "green"
};

const priorityTones: Record<DocumentPriority, "neutral" | "amber" | "red"> = {
  low: "neutral",
  medium: "neutral",
  high: "amber",
  critical: "red"
};

export function StatusBadge({ status, compact = false }: { status: DocumentStatus; compact?: boolean }) {
  if (compact) {
    return (
      <span
        title={STATUS_LABELS[status]}
        className={`inline-block h-2 w-2 shrink-0 rounded-full ${
          status === "done"
            ? "bg-green-400"
            : status === "in_progress"
              ? "bg-[var(--accent)]"
              : status === "review"
                ? "bg-amber-400"
                : "bg-[var(--border)]"
        }`}
      />
    );
  }
  return <Badge tone={statusTones[status]}>{STATUS_LABELS[status]}</Badge>;
}

export function PriorityBadge({ priority, compact = false }: { priority: DocumentPriority; compact?: boolean }) {
  if (compact && (priority === "low" || priority === "medium")) return null;
  if (compact) {
    return (
      <Badge tone={priorityTones[priority]} className="px-1.5 py-0 text-[10px]">
        {priority === "critical" ? "!" : "↑"}
      </Badge>
    );
  }
  return <Badge tone={priorityTones[priority]}>{PRIORITY_LABELS[priority]}</Badge>;
}

export function UserAvatar({
  user,
  size = "sm"
}: {
  user: Pick<Profile, "id" | "email" | "full_name" | "avatar_url"> | null | undefined;
  size?: "xs" | "sm";
}) {
  if (!user) return null;
  const initials = getInitials(user.full_name ?? user.email ?? "?");
  const dim = size === "xs" ? "h-5 w-5 text-[9px]" : "h-6 w-6 text-[10px]";
  return (
    <span
      title={user.full_name ?? user.email ?? ""}
      className={`flex shrink-0 items-center justify-center rounded-full bg-[var(--surface-soft)] font-semibold text-[var(--text)] ${dim}`}
    >
      {initials}
    </span>
  );
}

export function TagPills({ tags, max = 2 }: { tags: Array<{ tags: Tag | null }>; max?: number }) {
  const visible = tags.filter((t) => t.tags).slice(0, max);
  const rest = tags.filter((t) => t.tags).length - visible.length;
  return (
    <>
      {visible.map(({ tags: tag }) =>
        tag ? (
          <span
            key={tag.id}
            title={tag.name}
            className="max-w-[5rem] truncate rounded-full border border-[var(--border)] px-1.5 py-0 text-[10px] text-[var(--muted)]"
          >
            {tag.name}
          </span>
        ) : null
      )}
      {rest > 0 && (
        <span className="rounded-full border border-[var(--border)] px-1.5 py-0 text-[10px] text-[var(--muted)]">+{rest}</span>
      )}
    </>
  );
}
