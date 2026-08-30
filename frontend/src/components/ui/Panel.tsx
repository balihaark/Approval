/** Bordered surface used to group related content. Use sparingly. */
export function Panel({
  title,
  description,
  actions,
  padded = true,
  className = "",
  children,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  padded?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`ui-panel ${className}`}>
      {(title || actions) && (
        <header className="ui-panel-header">
          <div className="min-w-0">
            {title && <h2 className="ui-panel-title truncate">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-xs leading-5 text-slate-500">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  );
}

/** Compact label/value pair used in detail and status views. */
export function DataItem({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="ui-section-label">{label}</dt>
      <dd
        className={`mt-1 truncate text-base text-slate-800 ${mono ? "font-mono text-sm" : ""}`}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </dd>
    </div>
  );
}
