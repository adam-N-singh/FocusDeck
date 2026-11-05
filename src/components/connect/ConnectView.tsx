"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CONNECTOR_CATEGORIES, type ConnectorCategory } from "@/lib/connectors/manifest";
import { appLabel } from "@/lib/focus/apps";
import { refreshConnectors, useConnectorCatalog, type MarketConnector } from "@/lib/client/connectors";
import { useAppState, useNow } from "@/lib/client/hooks";
import { SearchIcon } from "@/components/ui/icons";
import { Badge, Chip, Disclosure, Dot, Section, Skeleton, inputClass } from "@/components/ui/primitives";
import { ConnectorDetail } from "./ConnectorDetail";
import { Listening } from "./Listening";
import { CATEGORY_LABEL, MATURITY, connectionLine } from "./status";

const STATUS_RANK = { ready: 0, spike: 1, planned: 2 } as const;
const REFRESH_MS = 5_000;
const WIDE = "(min-width: 1024px)";

type Filter = ConnectorCategory | "all" | "added";

function matches(c: MarketConnector, query: string): boolean {
  if (!query) return true;
  const haystack = [c.name, c.summary, c.description, c.publisher, CATEGORY_LABEL[c.category], ...c.emits.map((e) => appLabel(e.app))].join(" ").toLowerCase();
  return query.toLowerCase().split(/\s+/).every((word) => haystack.includes(word));
}

/** True on screens wide enough for list and detail side by side. False on the server. */
function useWide(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(WIDE);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}

function Explainer() {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong/70 p-5 sm:p-6">
      <h3 className="text-base font-semibold text-ink">How connectors work</h3>
      <div className="mt-2 max-w-[62ch] space-y-2 text-sm leading-6 text-ink-2">
        <p>A connector is a small, open program that runs next to an app: a hook, a browser extension, a tiny poller. You can read every line.</p>
        <p>It sends FocusDeck a few metadata fields, such as what kind of moment it was and which app, and nothing else. The bridge rejects anything more.</p>
        <p>FocusDeck only sees apps you choose. Adding a connector chooses its apps, and you can untick any of them.</p>
      </div>
      <p className="mt-4 max-w-[62ch] text-sm leading-6 text-ink-3">
        Building one? Put a folder with a <code className="text-ink-2">manifest.json</code> in <code className="text-ink-2">sensors/</code>, or point{" "}
        <code className="text-ink-2">FOCUSDECK_CONNECTORS_DIR</code> at your own folder. <code className="text-ink-2">sensors/CONTRIBUTING.md</code> explains the rest.
      </p>
    </div>
  );
}

/** Listening, then the connector marketplace: find one, see exactly what it sends, set it up, watch it go live. */
export function ConnectView() {
  const state = useAppState();
  const catalog = useConnectorCatalog();
  const now = useNow();
  const wide = useWide();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void refreshConnectors();
    const timer = setInterval(() => void refreshConnectors(), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const loading = !state.hydrated || catalog.status === "idle" || (catalog.status === "loading" && catalog.connectors.length === 0);
  const { model, bridge } = state;
  // The deck's own poll is fresher when it's running; the catalog's snapshot covers the rest.
  const stats = { ...catalog.stats, ...(bridge.stats?.byConnector ?? {}) };
  const categories = CONNECTOR_CATEGORIES.filter((cat) => catalog.connectors.some((c) => c.category === cat));
  const shown = catalog.connectors
    .filter((c) => (filter === "all" ? true : filter === "added" ? model.connectors.includes(c.id) : c.category === filter))
    .filter((c) => matches(c, query.trim()))
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || Number(b.verified) - Number(a.verified) || a.name.localeCompare(b.name));
  const selected = catalog.connectors.find((c) => c.id === selectedId) ?? null;

  const select = (id: string) => {
    const next = selectedId === id && !wide ? null : id;
    setSelectedId(next);
    if (next) requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: wide ? "nearest" : "start" }));
  };
  const close = () => setSelectedId(null);

  const detail = selected && (
    <div ref={detailRef} className="min-w-0 scroll-mt-20">
      <ConnectorDetail connector={selected} model={model} stats={stats[selected.id]} onClose={close} />
    </div>
  );

  return (
    <div className="space-y-12">
      <Listening />

      <Section
        id="connectors"
        title="Connectors"
        description="Pick one to see exactly what it sends and how to set it up. FocusDeck shows you the steps; it never installs or runs anything itself."
      >
        {loading ? (
          <Skeleton lines={5} />
        ) : (
          <>
            {catalog.status === "error" && (
              <p className="mb-4 text-sm text-attention">Couldn’t load the connector list: {catalog.error}</p>
            )}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <label className="relative block lg:w-80">
                <span className="sr-only">Search connectors</span>
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search: codex, github, browser"
                  className={`${inputClass} h-10 pl-9`}
                />
              </label>
              <div role="group" aria-label="Show connectors" className="flex flex-wrap gap-1.5">
                {(["all", "added", ...categories] as Filter[]).map((f) => (
                  <Chip key={f} pressed={filter === f} onClick={() => setFilter(f)}>
                    {f === "all" ? "All" : f === "added" ? `Added${model.connectors.length > 0 ? ` (${model.connectors.length})` : ""}` : CATEGORY_LABEL[f]}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]">
              <div className="min-w-0">
                {shown.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-line-strong/70 p-6 text-sm text-ink-2">
                    No connector matches. Try another word, or show all.
                  </p>
                ) : (
                  <ul aria-label="Connectors" className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                    {shown.map((c) => {
                      const added = model.connectors.includes(c.id);
                      const line = connectionLine(added, stats[c.id], now);
                      const maturity = MATURITY[c.status];
                      const isSelected = selectedId === c.id;
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => select(c.id)}
                            aria-expanded={wide ? undefined : isSelected}
                            aria-pressed={wide ? isSelected : undefined}
                            className={`block w-full px-4 py-3.5 text-left transition-colors ${isSelected ? "bg-accent-soft/60" : "hover:bg-ink/[0.03]"}`}
                          >
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-sm font-semibold text-ink">{c.name}</span>
                              {maturity && <Badge tone="outline">{maturity}</Badge>}
                              {!c.verified && <Badge tone="outline">Community</Badge>}
                            </span>
                            <span className="mt-0.5 line-clamp-2 block text-sm leading-6 text-ink-2">{c.summary}</span>
                            {line && (
                              <span className={`mt-1 flex items-center gap-2 text-xs ${line.tone === "attention" ? "text-attention" : "text-ink-3"}`}>
                                <Dot tone={line.tone} />
                                {line.text}
                              </span>
                            )}
                          </button>
                          {!wide && isSelected && <div className="border-t border-line bg-bg/60 p-3 sm:p-4">{detail}</div>}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {!wide && !selected && <div className="mt-6"><Explainer /></div>}
              </div>

              {wide && <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">{selected ? detail : <Explainer />}</div>}
            </div>

            {catalog.errors.length > 0 && (
              <Disclosure className="mt-6" title={`${catalog.errors.length} connector${catalog.errors.length === 1 ? "" : "s"} couldn’t be loaded`}>
                <ul className="space-y-2 text-sm leading-6 text-ink-2">
                  {catalog.errors.map((e) => (
                    <li key={e.path}>
                      <code className="text-ink">{e.path}</code>: {e.problems.join(" ")}
                    </li>
                  ))}
                </ul>
              </Disclosure>
            )}
          </>
        )}
      </Section>
    </div>
  );
}
