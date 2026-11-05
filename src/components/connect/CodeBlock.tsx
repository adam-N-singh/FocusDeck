"use client";

import { useEffect, useState } from "react";
import { CheckIcon } from "@/components/ui/icons";

/** A command or config to copy. FocusDeck shows it; it never runs it for you. */
export function CodeBlock({ code, label, language }: { code: string; label: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-line bg-sunk">
      <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-1">
        <span className="text-xs text-ink-3">{language ?? ""}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-ink-2 transition-colors hover:bg-ink/[0.06] hover:text-ink"
          aria-label={`Copy ${label}`}
        >
          {copied && <CheckIcon size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <span className="sr-only" aria-live="polite">{copied ? `${label} copied` : ""}</span>
      </div>
      <pre className="max-h-72 overflow-auto p-3 text-xs leading-5 whitespace-pre text-ink" aria-label={label}>
        {code}
      </pre>
    </div>
  );
}
