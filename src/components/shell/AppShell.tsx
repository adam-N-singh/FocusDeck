"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { isOpen } from "@/lib/focus/loops";
import { resolveMode } from "@/lib/focus/modes";
import { useDeck } from "@/lib/client/hooks";
import { takeOver } from "@/lib/client/leader";
import { store } from "@/lib/client/store";
import { clockLabel } from "@/lib/client/time";
import { PauseIcon, PlayIcon } from "@/components/ui/icons";
import { modeTint } from "@/components/ui/modeColor";
import { Button, Kbd } from "@/components/ui/primitives";
import { ThemePicker } from "./ThemePicker";

const NAV = [
  { href: "/", label: "Now" },
  { href: "/declare", label: "Setup" },
  { href: "/mirror", label: "Your week" },
  { href: "/connect", label: "Connect" },
  { href: "/sees", label: "Privacy" },
] as const;

const PAGE_NAME: Record<string, string> = {
  "/": "Now",
  "/declare": "Setup",
  "/mirror": "Your week",
  "/connect": "Connect",
  "/sees": "Privacy",
  "/lab": "Lab",
};

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * The room takes the colour of your mode; paused, it goes grey. The tab title
 * and favicon carry the same state, so a background tab still tells you
 * whether an agent is waiting.
 */
function useAtmosphere(pathname: string) {
  const { state, deck } = useDeck();
  const tint = modeTint(state.model.modes, deck.activeMode);
  const label = resolveMode(Object.fromEntries(state.model.modes.map((m) => [m.id, m])), deck.activeMode).label;
  const waiting = deck.loops.filter(isOpen).length;
  const k = deck.paused ? 0 : tint.k;

  useEffect(() => {
    if (!state.hydrated) return;
    const root = document.documentElement;
    root.style.setProperty("--h", String(tint.h));
    root.style.setProperty("--k", String(k));
    if (!root.dataset.atmosphere) requestAnimationFrame(() => requestAnimationFrame(() => (root.dataset.atmosphere = "on")));
  }, [state.hydrated, tint.h, k]);

  useEffect(() => {
    if (!state.hydrated) return;
    // On Now, the tab names your mode; elsewhere, the page. Either way it leads with who's waiting.
    const name = pathname === "/" ? (deck.paused ? "Paused" : label) : (PAGE_NAME[pathname] ?? "FocusDeck");
    document.title = `${waiting > 0 ? `(${waiting}) ` : ""}${name} — FocusDeck`;
  }, [state.hydrated, pathname, waiting, label, deck.paused]);

  useEffect(() => {
    if (!state.hydrated) return;
    const fill = `oklch(58% ${(0.16 * k).toFixed(3)} ${tint.h})`;
    const dot = waiting > 0 ? `<circle cx="25" cy="7" r="6.5" fill="oklch(58% 0.21 27)" stroke="white" stroke-width="2"/>` : "";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="${fill}"/><circle cx="16" cy="16" r="5" fill="white" opacity=".92"/>${dot}</svg>`;
    const href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    // Our own link, declared after the static favicon so browsers prefer it. The static one is
    // React's to manage; touching it breaks React's own cleanup on navigation.
    let link = document.querySelector<HTMLLinkElement>("link#focusdeck-icon");
    if (!link) {
      link = Object.assign(document.createElement("link"), { id: "focusdeck-icon", rel: "icon", type: "image/svg+xml" });
      link.setAttribute("sizes", "any");
      document.head.appendChild(link);
    }
    link.href = href;
  }, [state.hydrated, tint.h, k, waiting]);
}

/** 1–9 switch modes and P pauses, from any screen, unless you're typing. */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const { hydrated, leader, model } = store.getSnapshot();
      if (!hydrated || !leader) return;
      if (/^[1-9]$/.test(e.key)) {
        const mode = model.modes[Number(e.key) - 1];
        if (mode) store.dispatch({ type: "set-mode", at: store.now(), mode: mode.id });
      } else if (e.key === "p" || e.key === "P") {
        store.dispatch({ type: "toggle-pause", at: store.now() });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** Only what you'd act on from another screen: your mode, who's waiting, a broken sensor link, a running demo. */
function Status({ pathname }: { pathname: string }) {
  const { state, deck, modes, isDemo } = useDeck();
  if (!state.hydrated || !state.onboarded) return null;
  const { bridge } = state;
  const waiting = deck.loops.filter(isOpen).length;
  const onNow = pathname === "/";
  return (
    <div className="flex items-center gap-3 text-sm" aria-label="Status">
      {isDemo && (
        <Link href="/" className="hatch hidden rounded-md px-2 py-0.5 text-ink-2 ring-1 ring-line ring-inset sm:inline-block">
          Sample day {clockLabel(state.demo?.simMinute ?? 0)}
        </Link>
      )}
      {!onNow && (
        <Link href="/" className="hidden items-center gap-2 text-ink-2 hover:text-ink md:inline-flex">
          <span aria-hidden className="size-2 rounded-full bg-accent" />
          {resolveMode(modes, deck.activeMode).label}
        </Link>
      )}
      {!onNow && waiting > 0 && (
        <Link href="/" className="inline-flex items-center gap-1.5 font-medium text-attention">
          <span aria-hidden className="size-2 rounded-full bg-attention" />
          {waiting} waiting
        </Link>
      )}
      {bridge.enabled && !bridge.connected && (
        <Link href="/connect" title={bridge.lastError ?? undefined} className="hidden text-attention hover:underline sm:inline">
          Sensors unreachable
        </Link>
      )}
      <Button
        size="sm"
        variant={deck.paused ? "primary" : "ghost"}
        aria-pressed={deck.paused}
        title={deck.paused ? "Resume (P)" : "Pause FocusDeck (P)"}
        onClick={() => store.dispatch({ type: "toggle-pause", at: store.now() })}
      >
        {deck.paused ? <PlayIcon /> : <PauseIcon />}
        {deck.paused ? "Resume" : "Pause"}
      </Button>
    </div>
  );
}

function FollowerNotice() {
  const { state } = useDeck();
  if (!state.hydrated || state.leader) return null;
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="follower-title" className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-6 backdrop-blur-md">
      <div className="max-w-md rounded-[28px] border border-line bg-surface p-8 shadow-[0_30px_80px_-30px_var(--shadow)]">
        <h2 id="follower-title" className="text-2xl font-semibold tracking-tight text-ink">FocusDeck is open in another tab</h2>
        <p className="mt-3 text-base leading-7 text-ink-2">
          One tab runs at a time, so every event is counted once. This tab takes over by itself when the other one closes.
        </p>
        <Button variant="primary" size="lg" className="mt-6" onClick={takeOver}>Use FocusDeck here</Button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  useAtmosphere(pathname);
  useShortcuts();
  return (
    <div className="flex min-h-full flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-lg">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2 text-base font-semibold tracking-tight text-ink" aria-label="FocusDeck, Now">
            <span aria-hidden className="grid size-5 place-items-center rounded-full bg-accent">
              <span className="size-2 rounded-full bg-surface" />
            </span>
            <span className="hidden sm:inline">FocusDeck</span>
          </Link>
          <nav
            aria-label="Main"
            className="no-scrollbar -mx-1 flex min-w-0 flex-1 items-center gap-1 self-stretch overflow-x-auto [mask-image:linear-gradient(to_right,black_82%,transparent)] md:[mask-image:none]"
          >
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative shrink-0 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${active ? "font-medium text-ink" : "text-ink-2 hover:text-ink"}`}
                >
                  {item.label}
                  {active && <span aria-hidden className="absolute inset-x-2.5 -bottom-[11px] h-0.5 rounded-full bg-accent" />}
                </Link>
              );
            })}
          </nav>
          <Status pathname={pathname} />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-16 sm:px-6 sm:pt-10">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-5 text-sm text-ink-3 sm:px-6">
          <p>Everything FocusDeck knows stays in this browser. It never blocks anything.</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="hidden items-center gap-1.5 lg:inline-flex">
              <Kbd>1</Kbd>–<Kbd>9</Kbd> switch mode <Kbd>P</Kbd> pause
            </span>
            <ThemePicker />
            <Link href="/lab" className={`hover:text-ink ${pathname.startsWith("/lab") ? "text-ink" : ""}`}>Lab</Link>
          </div>
        </div>
      </footer>
      <FollowerNotice />
    </div>
  );
}
