import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, Info, RefreshCw, XCircle } from "lucide-react";
import { Button } from "./Button";

/* ---------------- Alert ---------------- */

const alertTones = {
  info: {
    box: "border-brand-100 bg-brand-50 text-brand-700",
    Icon: Info,
  },
  success: {
    box: "border-emerald-200/70 bg-emerald-50 text-emerald-800",
    Icon: CheckCircle2,
  },
  warning: {
    box: "border-amber-200/70 bg-amber-50 text-amber-800",
    Icon: AlertTriangle,
  },
  error: {
    box: "border-rose-200/70 bg-rose-50 text-rose-800",
    Icon: XCircle,
  },
} as const;

export function Alert({
  variant = "info",
  title,
  children,
  action,
}: {
  variant?: keyof typeof alertTones;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const { box, Icon } = alertTones[variant];
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded border px-3 py-2.5 text-sm ${box}`}
    >
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ---------------- Loading ---------------- */

export function Spinner({
  label,
  size = 16,
}: {
  label?: string;
  size?: number;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-500">
      <span
        role="status"
        aria-label={label ?? "Loading"}
        className="animate-spin rounded-full border-2 border-slate-300 border-t-brand-500"
        style={{ width: size, height: size }}
      />
      {label && <span>{label}</span>}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton block ${className}`} aria-hidden />;
}

/** Row placeholders that match the list layout, so loading doesn't shift content. */
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-line" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-start gap-4 px-4 py-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-[42%]" />
            <Skeleton className="h-3 w-[68%]" />
            <Skeleton className="h-3 w-[30%]" />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-3 w-28" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- Empty / error ---------------- */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center px-6 text-center ${
        compact ? "py-10" : "py-16"
      }`}
    >
      <div className="mb-3.5 flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-raised text-slate-400">
        <Icon size={18} strokeWidth={1.75} aria-hidden />
      </div>
      <h3 className="text-md font-semibold tracking-tightish text-slate-900">
        {title}
      </h3>
      <p className="mt-1.5 max-w-md text-sm leading-6 text-slate-500">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * Human-readable failure state. Explains what happened and offers a retry,
 * instead of surfacing a raw API string on its own.
 */
export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-3.5 flex h-10 w-10 items-center justify-center rounded-lg border border-rose-200/70 bg-rose-50 text-rose-600">
        <AlertTriangle size={18} strokeWidth={1.75} aria-hidden />
      </div>
      <h3 className="text-md font-semibold tracking-tightish text-slate-900">
        {title}
      </h3>
      <p className="mt-1.5 max-w-md text-sm leading-6 text-slate-500">
        {message || "The request could not be completed."} You can retry, or
        reload the page if it keeps failing.
      </p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-5" onClick={onRetry}>
          <RefreshCw size={14} aria-hidden /> Try again
        </Button>
      )}
    </div>
  );
}
