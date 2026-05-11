"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info";
type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  notify: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const notify = useCallback((message: string, tone: ToastTone = "info") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-3), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[90] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((toast) => {
          const Icon = toast.tone === "success" ? CheckCircle2 : toast.tone === "error" ? XCircle : Info;

          return (
            <div
              key={toast.id}
              className={cn(
                "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-2xl shadow-black/25",
                toast.tone === "success" && "border-emerald-400/35 bg-emerald-500/15 text-emerald-100",
                toast.tone === "error" && "border-red-400/35 bg-red-500/15 text-red-100",
                toast.tone === "info" && "border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{toast.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    return {
      notify: () => undefined
    };
  }

  return context;
}
