import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Small shared building blocks, in the prototype's visual language (zinc + emerald, rounded panels). */

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
  const border = tone === "accent" ? "border-emerald-800/70" : tone === "warn" ? "border-amber-700/60" : "border-zinc-800";
  return (
    <section id={id} aria-label={typeof title === "string" ? title : undefined} className={`rounded-2xl border ${border} bg-zinc-900/60 p-5 ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {kicker && <p className="text-[11px] font-semibold tracking-widest text-emerald-400 uppercase">{kicker}</p>}
            {title && <h2 className="text-sm font-semibold tracking-wide text-zinc-200 uppercase">{title}</h2>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={title || actions ? "mt-3" : ""}>{children}</div>
    </section>
  );
}

const BUTTON: Record<string, string> = {
  primary: "bg-emerald-400 font-semibold text-zinc-950 hover:bg-emerald-300",
  secondary: "bg-zinc-800 text-zinc-100 hover:bg-zinc-700",
  ghost: "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
  danger: "bg-red-500/15 text-red-300 hover:bg-red-500/25",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON; size?: "sm" | "md" }) {
  const pad = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";
  return (
    <button
      type="button"
      {...props}
      className={`rounded-full ${pad} ${BUTTON[variant]} transition disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    />
  );
}

const BADGE: Record<string, string> = {
  red: "bg-red-400/15 text-red-300",
  amber: "bg-amber-400/15 text-amber-300",
  emerald: "bg-emerald-400/15 text-emerald-300",
  sky: "bg-sky-400/15 text-sky-300",
  violet: "bg-violet-400/15 text-violet-300",
  zinc: "bg-zinc-700/50 text-zinc-300",
};

export function Badge({ tone = "zinc", children, title }: { tone?: keyof typeof BADGE; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${BADGE[tone]}`}>
      {children}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl bg-zinc-950/60 p-4">
      <p className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-50 tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs leading-5 text-zinc-500">{hint}</p>}
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
        className={`mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${checked ? "bg-emerald-400" : "bg-zinc-700"}`}
      >
        <span className={`h-4 w-4 rounded-full bg-zinc-950 transition ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
      <span>
        <span className="block text-sm text-zinc-200">{label}</span>
        {description && <span className="block text-xs leading-5 text-zinc-500">{description}</span>}
      </span>
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none";

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-zinc-800/80" style={{ width: `${90 - i * 15}%` }} />
      ))}
    </div>
  );
}
