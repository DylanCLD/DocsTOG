"use client";

import {
  createContext,
  useContext,
  useRef,
  useTransition,
  type FormHTMLAttributes
} from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast-provider";

type ActionFormStatus = {
  pending: boolean;
};

const ActionFormStatusContext = createContext<ActionFormStatus | null>(null);

type ActionFormProps = Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "onSubmit"> & {
  action: (formData: FormData) => Promise<void>;
  successMessage: string;
  errorMessage?: string;
  resetOnSuccess?: boolean;
  refreshOnSuccess?: boolean;
};

export function ActionForm({
  action,
  successMessage,
  errorMessage = "Action impossible.",
  resetOnSuccess = false,
  refreshOnSuccess = true,
  className,
  children,
  ...props
}: ActionFormProps) {
  const router = useRouter();
  const { notify } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <ActionFormStatusContext.Provider value={{ pending }}>
      <form
        ref={formRef}
        className={cn(className, pending && "opacity-85")}
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);

          startTransition(async () => {
            try {
              await action(formData);
              if (resetOnSuccess) {
                formRef.current?.reset();
              }
              notify(successMessage, "success");
              if (refreshOnSuccess) {
                router.refresh();
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : errorMessage;
              notify(message || errorMessage, "error");
            }
          });
        }}
        {...props}
      >
        {children}
      </form>
    </ActionFormStatusContext.Provider>
  );
}

export function useActionFormStatus() {
  return useContext(ActionFormStatusContext);
}
