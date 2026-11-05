import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ChevronIcon } from "./icons";

/**
 * Shared building blocks. Colours come only from the mode-derived tokens in
 * globals.css (bg, surface, sunk, line, ink, ink-2, ink-3, accent, attention),
 * so everything follows the mode and the light/dark scheme on its own.
 *
 * Radius encodes rank: the one offer card is 28px, grouped lists and boxed
 * panels 16px, buttons and inputs 10–12px, chips fully round.
 */

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-[62ch]">
        <h1 className="text-4xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-2 text-base leading-7 text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** An unboxed section: a heading, one plain sentence, then the content. */
export function Section({
  id,
  title,
  description,
  actions,
  children,
  className = "",
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-label={typeof title === "string" ? title : undefined} className={`scroll-mt-24 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[64ch]">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          {description && <p className="mt-1 text-sm leading-6 text-ink-2">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}

/** A boxed panel, for content that belongs together on a busy page. `kicker` reads as a subtitle. */
export function Panel({
  title,
  kicker,
  actions,
  children,
  className = "",
  tone = "default",
  id,
}: {
  title?: ReactNode;
  kicker?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: "default" | "accent" | "warn";
  id?: string;
}) {
  const border = tone === "accent" ? "border-accent-line" : tone === "warn" ? "border-attention/40" : "border-line";
  return (
    <section id={id} aria-label={typeof title === "string" ? title : undefined} className={`scroll-mt-24 rounded-2xl border ${border} bg-surface p-5 sm:p-6 ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-[64ch]">
            {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
            {kicker && <p className="mt-0.5 text-sm leading-6 text-ink-2">{kicker}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={title || actions ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

const BUTTON = {
  primary: "bg-accent text-accent-ink hover:bg-accent/88",
  secondary: "bg-ink/[0.045] text-ink ring-1 ring-inset ring-line hover:bg-ink/[0.08] hover:ring-line-strong",
  ghost: "text-ink-2 hover:bg-sunk hover:text-ink",
  danger: "text-attention hover:bg-attention-soft",
} as const;

// Small and medium buttons stay on one line; large ones may wrap a long label and grow.
const SIZE = {
  sm: "h-8 rounded-lg px-3 text-sm whitespace-nowrap",
  md: "h-10 rounded-xl px-4 text-sm whitespace-nowrap",
  lg: "min-h-12 flex-wrap rounded-xl px-5 py-2.5 text-base leading-snug",
} as const;

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON; size?: keyof typeof SIZE }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex shrink-0 items-center justify-center gap-x-2 gap-y-0.5 text-center font-medium transition-colors select-none disabled:cursor-not-allowed disabled:opacity-40 ${SIZE[size]} ${BUTTON[variant]} ${className}`}
    />
  );
}

/** A pressable preset: modes, filters, policies. */
export function Chip({
  pressed,
  className = "",
  role,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { pressed: boolean }) {
  return (
    <button
      type="button"
      role={role}
      aria-pressed={role === "radio" ? undefined : pressed}
      aria-checked={role === "radio" ? pressed : undefined}
      {...props}
      className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm transition-colors ${
        pressed ? "border-accent-line bg-accent-soft font-medium text-ink" : "border-line text-ink-2 hover:border-line-strong hover:text-ink"
      } ${className}`}
    />
  );
}

const TAG = {
  neutral: "bg-sunk text-ink-2",
  accent: "bg-accent-soft text-ink",
  attention: "bg-attention-soft text-attention",
  caution: "text-attention ring-1 ring-inset ring-attention/35",
  outline: "text-ink-2 ring-1 ring-inset ring-line",
} as const;

/** Older tone names, kept so every screen speaks the same small vocabulary. */
const LEGACY: Record<string, keyof typeof TAG> = {
  red: "attention",
  amber: "caution",
  emerald: "accent",
  sky: "neutral",
  violet: "outline",
  zinc: "neutral",
};

export type TagTone = keyof typeof TAG | keyof typeof LEGACY;

export function Badge({ tone = "neutral", children, title }: { tone?: TagTone; children: ReactNode; title?: string }) {
  const key = (tone in TAG ? tone : LEGACY[tone] ?? "neutral") as keyof typeof TAG;
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs whitespace-nowrap ${TAG[key]}`}>
      {children}
    </span>
  );
}

export const Tag = Badge;

export function Dot({ tone = "accent", className = "" }: { tone?: "accent" | "attention" | "muted"; className?: string }) {
  const color = tone === "attention" ? "bg-attention" : tone === "muted" ? "bg-ink-3" : "bg-accent";
  return <span aria-hidden className={`inline-block size-2 shrink-0 rounded-full ${color} ${className}`} />;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl bg-sunk p-4">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs leading-5 text-ink-3">{hint}</p>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors ${checked ? "bg-accent" : "bg-line-strong"}`}
      >
        <span className={`size-5 rounded-full bg-surface shadow-sm transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
      </button>
      <span className="min-w-0">
        <span className="block text-sm text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-sm leading-6 text-ink-2">{description}</span>}
      </span>
    </label>
  );
}

/** Progressive disclosure: secondary detail stays one click away instead of on screen. */
export function Disclosure({
  title,
  meta,
  children,
  defaultOpen,
  className = "",
}: {
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details className={`group ${className}`} open={defaultOpen}>
      <summary className="flex w-fit cursor-pointer items-start gap-1.5 rounded-lg py-1.5 text-sm font-medium text-ink-2 hover:text-ink">
        <ChevronIcon className="chevron mt-[3px] shrink-0 transition-transform duration-200" size={14} />
        <span>
          {title}
          {meta !== undefined && <span className="ml-1.5 font-normal text-ink-3">{meta}</span>}
        </span>
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

/** Rows that belong together — a settings list, a queue. */
export function Group({ children, className = "", label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <ul aria-label={label} className={`divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface ${className}`}>
      {children}
    </ul>
  );
}

export function Meter({ value, max, label, alert }: { value: number; max: number; label: string; alert?: boolean }) {
  const share = Math.min(1, max > 0 ? value / max : 0);
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-line" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <div className={`h-full rounded-full transition-[width] duration-500 ${alert ? "bg-attention" : "bg-accent"}`} style={{ width: `${share * 100}%` }} />
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line px-1 text-[11px] leading-none text-ink-3">{children}</kbd>;
}

export const inputClass =
  "w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none";

export const selectClass =
  "rounded-[10px] border border-line bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none";

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-line/70" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}
