"use client";

import type React from "react";
import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { useActionFormStatus } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";

type SubmitButtonProps = {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
};

export function SubmitButton({
  children,
  pendingLabel = "Chargement...",
  className,
  variant,
  size
}: SubmitButtonProps) {
  const actionFormStatus = useActionFormStatus();
  const { pending: nativePending } = useFormStatus();
  const pending = actionFormStatus?.pending ?? nativePending;

  return (
    <Button type="submit" className={className} variant={variant} size={size} disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
