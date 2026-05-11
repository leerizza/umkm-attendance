import React, { createContext, useContext, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle, XCircle, AlertCircle, X } from "lucide-react";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastContextValue {
  toast: (opts: Omit<Toast, "id">) => void;
  success: (title: string, description?: string, duration?: number) => void;
  error: (title: string, description?: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((opts: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2);
    const toast = { ...opts, id };
    setToasts((prev) => [...prev.slice(-3), toast]);
    setTimeout(() => remove(id), opts.duration ?? 4000);
  }, [remove]);

  const success = useCallback((title: string, description?: string, duration?: number) =>
    addToast({ type: "success", title, description, duration }), [addToast]);

  const error = useCallback((title: string, description?: string, duration?: number) =>
    addToast({ type: "error", title, description, duration }), [addToast]);

  return (
    <ToastContext.Provider value={{ toast: addToast, success, error }}>
      {children}
      {/* Toast container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const icons = {
    success: <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />,
    error:   <XCircle className="h-4 w-4 text-red-500 shrink-0" />,
    info:    <AlertCircle className="h-4 w-4 text-blue-500 shrink-0" />,
    warning: <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />,
  };

  const borders = {
    success: "border-l-emerald-400",
    error:   "border-l-red-400",
    info:    "border-l-blue-400",
    warning: "border-l-amber-400",
  };

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-xl border bg-white shadow-lg px-4 py-3 border-l-4 animate-slide-up",
        borders[toast.type]
      )}
    >
      {icons[toast.type]}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{toast.title}</p>
        {toast.description && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{toast.description}</p>
        )}
      </div>
      <button
        onClick={onClose}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
