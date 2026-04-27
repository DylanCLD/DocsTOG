"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DeleteButton({
  action,
  label = "Supprimer"
}: {
  action: () => Promise<void>;
  label?: string;
}) {
  return (
    <form
      action={async () => {
        if (window.confirm("Confirmer la suppression ? Cette action est définitive.")) {
          await action();
        }
      }}
    >
      <Button type="submit" variant="danger" size="sm">
        <Trash2 className="h-4 w-4" />
        {label}
      </Button>
    </form>
  );
}
