"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { resolveMode } from "@/lib/focus/modes";
import { useDeck } from "@/lib/client/hooks";
import { takeOver } from "@/lib/client/leader";
import { clockLabel } from "@/lib/client/time";
import { Badge, Button } from "@/components/ui/primitives";

const NAV = [
  { href: "/", label: "Now" },
  { href: "/declare", label: "Declare" },
  { href: "/mirror", label: "Mirror" },
  { href: "/sees", label: "What it sees" },
  { href: "/lab", label: "Lab" },
];

function Status() {
  const { state, deck, modes, isDemo } = useDeck();
  if (!state.hydrated) return null;
  const bridge = state.bridge;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Status">
      <Badge tone="emerald">{resolveMode(modes, deck.activeMode).label}</Badge>
      {deck.paused && <Badge tone="amber">Guarding paused</Badge>}
      {isDemo && <Badge tone="violet">Demo · {clockLabel(state.demo?.simMinute ?? 0)}</Badge>}
      <Badge tone={!bridge.enabled ? "zinc" : bridge.connected ? "sky" : "red"} title={bridge.lastError ?? undefined}>
        Sensors {!bridge.enabled ? "off" : bridge.connected ? "connected" : "unreachable"}
      </Badge>
    </div>
  );
}

function FollowerNotice() {
  const { state } = useDeck();
  if (!state.hydrated || state.leader) return null;
  return (
    <div role="alertdialog" aria-label="FocusDeck is open in another tab" className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/85 p-6 backdrop-blur-sm">
      <div className="max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6">
        <h2 className="text-lg font-semibold text-zinc-50">FocusDeck is running in another tab</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Only one tab runs the deck at a time, so sensor events are counted once and nothing overwrites anything. This tab takes
          over automatically when the other one closes.
        </p>
        <Button variant="primary" className="mt-4" onClick={takeOver}>Use FocusDeck here</Button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/" className="text-base font-semibold tracking-tight text-zinc-50">
              Focus<span className="text-emerald-400">Deck</span>
            </Link>
            <nav aria-label="Main" className="flex flex-wrap gap-1">
              {NAV.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-full px-3 py-1.5 text-sm transition ${active ? "bg-zinc-100 font-medium text-zinc-950" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <Status />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      <footer className="border-t border-zinc-900 py-4 text-center text-xs text-zinc-600">
        Local-first: everything FocusDeck knows stays in this browser. Replacement, never restriction.
      </footer>
      <FollowerNotice />
    </div>
  );
}
