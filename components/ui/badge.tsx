import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "accent" | "green" | "amber" | "red";
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tone === "neutral" && "border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--muted)]",
        tone === "accent" && "border-emerald-400/30 bg-emerald-400/12 text-emerald-200",
        tone === "green" && "border-green-400/30 bg-green-400/12 text-green-200",
        tone === "amber" && "border-amber-400/30 bg-amber-400/12 text-amber-200",
        tone === "red" && "border-red-400/30 bg-red-400/12 text-red-200",
        className
      )}
      {...props}
    />
  );
}
