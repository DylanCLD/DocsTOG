import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeTone = "neutral" | "accent" | "info" | "green" | "amber" | "red";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

// Coloured tones read their hue from --tone (a theme token) so they stay legible
// in both the dark and the light theme.
const toneVariables: Record<Exclude<BadgeTone, "neutral">, string> = {
  accent: "[--tone:var(--accent)]",
  info: "[--tone:var(--info)]",
  green: "[--tone:var(--success)]",
  amber: "[--tone:var(--warning)]",
  red: "[--tone:var(--danger)]"
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tone === "neutral"
          ? "border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--muted)]"
          : cn(
              "border-[color-mix(in_srgb,var(--tone)_34%,transparent)] bg-[color-mix(in_srgb,var(--tone)_var(--tone-tint),transparent)] text-[var(--tone)]",
              toneVariables[tone]
            ),
        className
      )}
      {...props}
    />
  );
}
