"use client";

import * as React from "react";

export type ToastVariant = "success" | "error" | "info" | "warning";

export interface ToastMessage {
  id: number;
  title?: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastContextValue {
  showToast: (msg: Omit<ToastMessage, "id">) => void;
}

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined);

let idCounter = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = React.useState<ToastMessage[]>([]);

  const showToast = React.useCallback((msg: Omit<ToastMessage, "id">) => {
    const id = idCounter++;
    const fullMsg: ToastMessage = { id, ...msg };
    setMessages((prev) => [...prev, fullMsg]);
    setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    }, 4000);
  }, []);

  const remove = (id: number) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  const value = React.useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed inset-x-0 top-2 z-50 flex flex-col items-center space-y-2 px-2">
        {messages.map((m) => (
          <div
            key={m.id}
            className={[
              "w-full max-w-md rounded-md border px-3 py-2 text-sm shadow-sm bg-white dark:bg-slate-900 flex items-start gap-2",
              m.variant === "success" && "border-emerald-500/60 text-emerald-900 dark:text-emerald-100",
              m.variant === "error" && "border-critical-500/60 text-critical-900 dark:text-critical-100",
              m.variant === "warning" && "border-amber-500/60 text-amber-900 dark:text-amber-100",
              (!m.variant || m.variant === "info") && "border-slate-300 text-slate-900 dark:text-slate-100",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className="flex-1">
              {m.title && <div className="font-medium text-xs mb-0.5">{m.title}</div>}
              {m.description && (
                <div className="text-[11px] leading-snug text-slate-700 dark:text-slate-300">
                  {m.description}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => remove(m.id)}
              className="ml-2 text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              Close
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
