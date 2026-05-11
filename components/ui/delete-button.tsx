"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";

export function DeleteButton({
  action,
  label = "Supprimer",
  successMessage = "Suppression effectuée."
}: {
  action: () => Promise<void>;
  label?: string;
  successMessage?: string;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (window.confirm("Confirmer la suppression ? Cette action est définitive.")) {
          startTransition(async () => {
            try {
              await action();
              notify(successMessage, "success");
              router.refresh();
            } catch (error) {
              const message = error instanceof Error ? error.message : "Suppression impossible.";
              notify(message, "error");
            }
          });
        }
      }}
    >
      <Button type="submit" variant="danger" size="sm" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        {pending ? "Suppression..." : label}
      </Button>
    </form>
  );
}
