"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

type ToastTone = "success" | "error" | "info";

type Toast = {
  id: number;
  tone: ToastTone;
  message: string;
};

type ToastContextValue = {
  toast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TONES: Record<
  ToastTone,
  { icon: typeof Info; ring: string; iconColor: string }
> = {
  success: {
    icon: CheckCircle2,
    ring: "ring-emerald-200/70",
    iconColor: "text-emerald-600",
  },
  error: { icon: XCircle, ring: "ring-rose-200/70", iconColor: "text-rose-600" },
  info: { icon: Info, ring: "ring-line", iconColor: "text-brand-600" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev.slice(-2), { id, tone, message }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4000)
      );
    },
    [dismiss]
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(calc(100vw-2rem),22rem)] flex-col gap-2"
      >
        {toasts.map((t) => {
          const { icon: Icon, ring, iconColor } = TONES[t.tone];
          return (
            <div
              key={t.id}
              className={`animate-toast-in pointer-events-auto flex items-start gap-2.5 rounded-lg bg-white px-3 py-2.5 shadow-popover ring-1 ${ring}`}
            >
              <Icon size={16} className={`mt-0.5 shrink-0 ${iconColor}`} aria-hidden />
              <p className="min-w-0 flex-1 text-sm leading-5 text-slate-700">
                {t.message}
              </p>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => dismiss(t.id)}
                className="-mr-1 -mt-0.5 rounded p-1 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  // Non-fatal fallback keeps components usable outside the provider (e.g. tests).
  return ctx ?? { toast: () => undefined };
}
