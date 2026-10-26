/**
 * Shared layout primitives.
 *
 * Pages were each hand-rolling headers, cards and section chrome with
 * hardcoded palette colours (blue-100, sky-600, violet-950…) that ignored the
 * theme tokens and broke in dark mode. These wrap the tokens instead, so a
 * palette change lands everywhere at once.
 */
import Link from "next/link";
import { handleRadioKeyDown } from "../../lib/radio-keyboard";

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
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
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
      className={`col-span-6 flex flex-col overflow-hidden rounded-md border border-border bg-surface transition-colors ${spanClass} ${className}`}
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
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      onKeyDown={handleRadioKeyDown}
      className={[
        "flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors",
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
    <div className="flex min-w-0 flex-col gap-1.5">
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-xs font-medium text-muted">{label}</span>
        {children}
      </label>
      {hint && <span className="text-xs leading-relaxed text-faint">{hint}</span>}
    </div>
  );
}

export const inputClass =
  "w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm outline-none placeholder:text-faint";

export const inputMonoClass =
  "w-full rounded-md border border-border bg-surface-raised px-3 py-2 font-mono text-xs outline-none placeholder:text-faint";

/* ── Buttons ───────────────────────────────────────────────────────────── */

export const buttonPrimary =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60";

export const buttonSecondary =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-border bg-surface-raised px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:border-border-hover hover:bg-surface-sunken disabled:opacity-60";

export const buttonGhost =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-border bg-surface-raised px-3.5 py-2 text-sm font-medium transition-colors hover:border-border-hover hover:bg-surface-sunken";

export const buttonSubtle =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-sunken hover:text-foreground";

export const buttonDanger =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger-light";

/* ── Badges ────────────────────────────────────────────────────────────── */

export function Badge({
  children,
  variant = "default",
  size = "sm",
  className = "",
}: {
  children: React.ReactNode;
  variant?: "default" | "accent" | "success" | "muted" | "outline";
  size?: "xs" | "sm";
  className?: string;
}) {
  const variantStyles = {
    default: "bg-surface-sunken text-muted border border-border/70",
    accent: "bg-accent-light text-accent-dark font-medium",
    success: "bg-success-light text-success font-medium",
    muted: "bg-surface-sunken text-faint",
    outline: "border border-border text-muted",
  }[variant];

  const sizeStyles = {
    xs: "px-1.5 py-0.5 text-[10px]",
    sm: "px-2 py-0.5 text-xs",
  }[size];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md leading-none ${sizeStyles} ${variantStyles} ${className}`}
    >
      {children}
    </span>
  );
}

/* ── Segmented Control (Accessible Tabs) ────────────────────────────────── */

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = "md",
}: {
  value: T;
  onChange: (val: T) => void;
  options: Array<{
    value: T;
    label: React.ReactNode;
    icon?: React.ReactNode;
    badge?: React.ReactNode;
  }>;
  size?: "sm" | "md";
}) {
  const sizeClasses = {
    sm: "p-0.5 text-xs gap-0.5",
    md: "p-1 text-xs sm:text-sm gap-1",
  }[size];

  const itemSizeClasses = {
    sm: "px-2.5 py-1 rounded-md",
    md: "px-3 py-1.5 rounded-md",
  }[size];

  return (
    <div
      role="tablist"
      className={`inline-flex max-w-full items-center overflow-x-auto rounded-md border border-border bg-surface-sunken ${sizeClasses}`}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`inline-flex shrink-0 items-center gap-1.5 font-medium transition-all ${itemSizeClasses} ${
              active
                ? "bg-surface-raised text-foreground shadow-xs border border-border/80"
                : "text-muted hover:text-foreground hover:bg-surface/50 border border-transparent"
            }`}
          >
            {opt.icon && (
              <span
                className={`shrink-0 ${active ? "text-accent" : "text-faint"}`}
              >
                {opt.icon}
              </span>
            )}
            <span>{opt.label}</span>
            {opt.badge && <span className="ml-0.5">{opt.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

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
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-surface/50 px-6 py-10 text-center transition-colors">
      {icon && (
        <span className="flex h-11 w-11 items-center justify-center rounded-md bg-surface-sunken text-muted ring-1 ring-border/50">
          {icon}
        </span>
      )}
      <div className="space-y-1">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {description && (
          <p className="max-w-xs text-xs leading-relaxed text-muted">
            {description}
          </p>
        )}
      </div>
      {action && (
        <Link href={action.href} className={`${buttonPrimary} mt-1 text-xs`}>
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
