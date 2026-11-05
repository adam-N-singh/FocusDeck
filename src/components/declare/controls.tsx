"use client";

import type { ReactNode } from "react";
import type { UserModel } from "@/lib/focus/model";

/** Every Setup edit saves at once: it is applied to the latest model in the store. */
export type Update = (fn: (m: UserModel) => UserModel) => void;

/** A bare switch for list rows, where the row itself names what it controls. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  title,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`inline-flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${checked ? "bg-accent" : "bg-line-strong"}`}
    >
      <span className={`size-5 rounded-full bg-surface shadow-sm transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}

/** A visible label above a control. */
export function Field({ label, hint, children, className = "" }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1.5 block text-sm text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-5 text-ink-3">{hint}</span>}
    </label>
  );
}

/** A quiet text button for inline actions inside sentences. */
export function TextButton({ children, onClick, tone = "default" }: { children: ReactNode; onClick: () => void; tone?: "default" | "danger" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`underline underline-offset-4 transition-colors ${tone === "danger" ? "text-attention decoration-attention/40 hover:decoration-attention" : "text-ink decoration-line-strong hover:decoration-accent"}`}
    >
      {children}
    </button>
  );
}
