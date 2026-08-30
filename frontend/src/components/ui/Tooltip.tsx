/** Lightweight CSS tooltip for icon-only or truncated controls. */
export function Tooltip({
  label,
  side = "top",
  children,
}: {
  label: string;
  side?: "top" | "bottom" | "right";
  children: React.ReactNode;
}) {
  const position = {
    top: "bottom-full left-1/2 mb-1.5 -translate-x-1/2",
    bottom: "top-full left-1/2 mt-1.5 -translate-x-1/2",
    right: "left-full top-1/2 ml-1.5 -translate-y-1/2",
  }[side];

  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-2xs font-medium text-white opacity-0 shadow-popover
          transition-opacity duration-150
          group-hover/tt:opacity-100 group-focus-within/tt:opacity-100 ${position}`}
      >
        {label}
      </span>
    </span>
  );
}
