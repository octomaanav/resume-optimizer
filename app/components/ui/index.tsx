/**
 * Shared layout primitives.
 *
 * Pages were each hand-rolling headers, cards and section chrome with
 * hardcoded palette colours (blue-100, sky-600, violet-950…) that ignored the
 * theme tokens and broke in dark mode. These wrap the tokens instead, so a
 * palette change lands everywhere at once.
 */
import Link from "next/link";

/* ── Page header ───────────────────────────────────────────────────────── */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-2xl">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="text-2xl sm:text-[1.75rem]">{title}</h1>
        {description && (
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ── Bento tile ────────────────────────────────────────────────────────── */

/**
 * One cell of a bento grid. `span` is applied at `lg:` so every tile is
 * full-width on small screens and the grid only asserts itself when there is
 * room for it.
 */
export function Tile({
  title,
  icon,
  description,
  span = 6,
  padded = true,
  footer,
  className = "",
  children,
}: {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  description?: React.ReactNode;
  /** Columns out of 6. */
  span?: 2 | 3 | 4 | 6;
  padded?: boolean;
  footer?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  const spanClass = {
    2: "lg:col-span-2",
    3: "lg:col-span-3",
    4: "lg:col-span-4",
    6: "lg:col-span-6",
  }[span];

  return (
    <section
      className={`col-span-6 flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition-colors ${spanClass} ${className}`}
    >
      {(title || description) && (
        <div className={padded ? "p-5 pb-0" : "px-5 pt-5"}>
          {title && (
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              {icon && <span className="text-accent">{icon}</span>}
              {title}
            </h2>
          )}
          {description && (
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              {description}
            </p>
          )}
        </div>
      )}
      <div className={`flex-1 ${padded ? "p-5" : ""}`}>{children}</div>
      {footer && (
        <div className="border-t border-border bg-surface-sunken px-5 py-3">
          {footer}
        </div>
      )}
    </section>
  );
}

/** Bento grid container — 6 columns from `lg` up, single column below. */
export function Bento({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-6 gap-4 ${className}`}>{children}</div>
  );
}

/* ── Selectable card (replaces bare radios) ────────────────────────────── */

export function ChoiceCard({
  selected,
  onSelect,
  icon,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  icon?: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={[
        "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
        selected
          ? "border-accent bg-accent-light"
          : "border-border bg-surface-raised hover:border-border-hover hover:bg-surface-sunken",
      ].join(" ")}
    >
      {icon && (
        <span
          className={`mt-0.5 shrink-0 ${selected ? "text-accent" : "text-muted"}`}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0">
        <span
          className={`block text-sm font-medium ${selected ? "text-accent-dark" : ""}`}
        >
          {title}
        </span>
        {description && (
          <span className="mt-0.5 block text-xs leading-relaxed text-muted">
            {description}
          </span>
        )}
      </span>
      <span
        className={[
          "ml-auto mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 transition-colors",
          selected ? "border-accent bg-accent" : "border-border-hover",
        ].join(" ")}
        aria-hidden
      >
        {selected && (
          <span className="block h-full w-full scale-[0.4] rounded-full bg-on-accent" />
        )}
      </span>
    </button>
  );
}

/* ── Form field ────────────────────────────────────────────────────────── */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs leading-relaxed text-faint">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm outline-none placeholder:text-faint";

export const inputMonoClass =
  "w-full rounded-lg border border-border bg-surface-raised px-3 py-2 font-mono text-xs outline-none placeholder:text-faint";

/* ── Buttons ───────────────────────────────────────────────────────────── */

export const buttonPrimary =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60";

export const buttonGhost =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3.5 py-2 text-sm font-medium transition-colors hover:border-border-hover hover:bg-surface-sunken";

/* ── Empty state ───────────────────────────────────────────────────────── */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center">
      {icon && <span className="text-faint">{icon}</span>}
      <div className="text-sm font-medium">{title}</div>
      {description && (
        <p className="max-w-xs text-xs leading-relaxed text-muted">
          {description}
        </p>
      )}
      {action && (
        <Link href={action.href} className={`${buttonGhost} mt-2`}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** Small count/status chip. */
export function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xl font-semibold tabular-nums">{value}</span>
      <span className="eyebrow">{label}</span>
    </div>
  );
}
