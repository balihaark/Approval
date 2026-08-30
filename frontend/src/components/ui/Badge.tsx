type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  info: "bg-brand-50 text-brand-700 ring-brand-100",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
  warning: "bg-amber-50 text-amber-800 ring-amber-200/70",
  danger: "bg-rose-50 text-rose-700 ring-rose-200/70",
};

const dots: Record<Tone, string> = {
  neutral: "bg-slate-400",
  info: "bg-brand-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
};

export function Badge({
  tone = "neutral",
  dot = false,
  uppercase = false,
  title,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  uppercase?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
        tones[tone]
      } ${uppercase ? "text-2xs uppercase tracking-wideish" : ""}`}
    >
      {dot && (
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dots[tone]}`} aria-hidden />
      )}
      <span className="truncate">{children}</span>
    </span>
  );
}

export type BadgeTone = Tone;
