import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "subtle";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 shadow-xs",
  secondary:
    "border border-line bg-white text-slate-700 hover:bg-slate-50 hover:border-line-strong active:bg-slate-100 shadow-xs",
  subtle:
    "bg-slate-100 text-slate-700 hover:bg-slate-200/80 active:bg-slate-200",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200/70",
  danger: "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 shadow-xs",
  success:
    "bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 shadow-xs",
};

const sizes: Record<Size, string> = {
  sm: "h-control-sm gap-1.5 px-2.5 text-sm",
  md: "h-control gap-2 px-3 text-base",
  lg: "h-control-lg gap-2 px-4 text-base",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: Size;
    loading?: boolean;
  }
>(function Button(
  {
    className = "",
    variant = "primary",
    size = "md",
    loading = false,
    disabled,
    children,
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded font-medium
        transition-colors duration-150
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35 focus-visible:ring-offset-1
        disabled:pointer-events-none disabled:opacity-50
        ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading && (
        <span
          className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
});

/** Icon-only button. Always pass `label` so it stays accessible. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
    variant?: Variant;
    size?: Size;
  }
>(function IconButton(
  { className = "", label, variant = "ghost", size = "md", children, ...props },
  ref
) {
  const box = size === "sm" ? "h-control-sm w-7" : "h-control w-control";
  return (
    <button
      ref={ref}
      title={label}
      aria-label={label}
      className={`inline-flex items-center justify-center rounded
        transition-colors duration-150
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35 focus-visible:ring-offset-1
        disabled:pointer-events-none disabled:opacity-50
        ${variants[variant]} ${box} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});
