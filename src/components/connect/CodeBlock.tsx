"use client";

import { useState } from "react";

/** A command or config to copy. FocusDeck shows it; it never runs it for you. */
export function CodeBlock({ code, label, language }: { code: string; label: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1">
        <span className="font-mono text-[11px] text-zinc-500">{language ?? ""}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-md px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
          aria-label={`Copy ${label}`}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-72 overflow-auto p-3 font-mono text-xs leading-5 whitespace-pre text-zinc-300" aria-label={label}>
        {code}
      </pre>
    </div>
  );
}
