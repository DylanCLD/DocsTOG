"use client";

import { useTransition } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function FavoriteButton({
  isFavorite,
  onToggle,
  disabled = false
}: {
  isFavorite: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={disabled || pending}
      title={isFavorite ? "Retirer des favoris" : "Épingler dans la sidebar"}
      aria-label={isFavorite ? "Retirer des favoris" : "Épingler dans la sidebar"}
      onClick={() => startTransition(() => onToggle())}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-[var(--muted)] transition hover:border-[var(--border)] hover:bg-[var(--surface-elevated)]",
        isFavorite && "text-amber-400 hover:text-amber-300",
        pending && "opacity-50"
      )}
    >
      <Star className={cn("h-4 w-4", isFavorite && "fill-amber-400")} />
    </button>
  );
}
