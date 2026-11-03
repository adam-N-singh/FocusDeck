"use client";

import { useEffect, useRef, useState } from "react";
import { CONNECTOR_CATEGORIES, type ConnectorCategory } from "@/lib/connectors/manifest";
import { appLabel } from "@/lib/focus/apps";
import { refreshConnectors, useConnectorCatalog, type MarketConnector } from "@/lib/client/connectors";
import { useAppState, useNow } from "@/lib/client/hooks";
import { store } from "@/lib/client/store";
import { Badge, Button, Panel, Skeleton, inputClass } from "@/components/ui/primitives";
import { ConnectorDetail, STATUS_BADGE, connectionLine } from "./ConnectorDetail";

const CATEGORY_LABEL: Record<ConnectorCategory, string> = {
  agents: "AI agents",
  editor: "Editors",
  comms: "Comms",
  browser: "Browser",
  os: "Your computer",
  tasks: "Tasks & PRs",
  generic: "Generic",
};
const STATUS_RANK = { ready: 0, spike: 1, planned: 2 } as const;
const REFRESH_MS = 5_000;

type Filter = ConnectorCategory | "all" | "added";

function matches(c: MarketConnector, query: string): boolean {
  if (!query) return true;
  const haystack = [c.name, c.summary, c.description, c.publisher, CATEGORY_LABEL[c.category], ...c.emits.map((e) => appLabel(e.app))].join(" ").toLowerCase();
  return query.toLowerCase().split(/\s+/).every((word) => haystack.includes(word));
}

/** The connector marketplace: find a connector, see exactly what it sends, set it up, watch it go live. */
export function ConnectView() {
  const state = useAppState();
  const catalog = useConnectorCatalog();
  const now = useNow();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void refreshConnectors();
    const timer = setInterval(() => void refreshConnectors(), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  if (!state.hydrated || catalog.status === "idle" || (catalog.status === "loading" && catalog.connectors.length === 0)) {
    return <Panel><Skeleton lines={6} /></Panel>;
  }
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
    setSelectedId(id);
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  return (
    <div className="space-y-4">
      {!bridge.enabled && (
        <Panel tone="warn">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-amber-100/90">Listening for sensor events is off, so connectors can send but nothing reaches your deck.</p>
            <Button size="sm" variant="primary" onClick={() => store.setBridge({ enabled: true })}>Turn listening on</Button>
          </div>
        </Panel>
      )}
      {catalog.status === "error" && (
        <Panel tone="warn"><p className="text-sm text-amber-100/90">Couldn’t load the catalog: {catalog.error}</p></Panel>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search connectors: codex, github, browser…" aria-label="Search connectors" className={`${inputClass} sm:max-w-sm`} />
        <div role="group" aria-label="Filter connectors" className="flex flex-wrap gap-1.5">
          {(["all", "added", ...categories] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 text-xs transition ${filter === f ? "bg-zinc-100 font-medium text-zinc-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
            >
              {f === "all" ? "All" : f === "added" ? `Added (${model.connectors.length})` : CATEGORY_LABEL[f]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <ul className="grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-1" aria-label="Connectors">
          {shown.length === 0 && <li className="rounded-2xl border border-dashed border-zinc-800 p-6 text-sm text-zinc-500">No connector matches. Try another word, or a different filter.</li>}
          {shown.map((c) => {
            const added = model.connectors.includes(c.id);
            const line = connectionLine(added, stats[c.id], now);
            const status = STATUS_BADGE[c.status];
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => select(c.id)}
                  aria-pressed={selectedId === c.id}
                  className={`w-full rounded-2xl border p-4 text-left transition ${selectedId === c.id ? "border-emerald-700 bg-zinc-900" : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-zinc-100">{c.name}</p>
                      <p className="text-[11px] tracking-wide text-zinc-500 uppercase">{CATEGORY_LABEL[c.category]} · {c.verified ? "FocusDeck ✓" : c.publisher}</p>
                    </div>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-zinc-400">{c.summary}</p>
                  {line && <p className="mt-2"><Badge tone={line.tone}>{line.text}</Badge></p>}
                </button>
              </li>
            );
          })}
        </ul>

        <div ref={detailRef} className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          {selected ? (
            <ConnectorDetail connector={selected} model={model} stats={stats[selected.id]} onClose={() => setSelectedId(null)} />
          ) : (
            <Panel title="How connectors work" kicker="Pick one to see exactly what it sends">
              <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-zinc-300">
                <li>A connector is a small, open sensor that runs next to an app — a hook, an extension, a tiny program. You can read every line.</li>
                <li>It sends FocusDeck a few metadata fields — what kind of moment, which app, an opaque session hash — and nothing else. The bridge rejects anything more.</li>
                <li>Only apps you designate are seen. Adding a connector designates its apps; you can uncheck any of them.</li>
                <li>FocusDeck shows you the setup and fills in this machine’s paths. It never installs or runs anything itself.</li>
              </ol>
              <p className="mt-3 text-xs leading-5 text-zinc-500">
                Building one? Drop a folder with a <code className="text-zinc-300">manifest.json</code> into <code className="text-zinc-300">sensors/</code>, or point{" "}
                <code className="text-zinc-300">FOCUSDECK_CONNECTORS_DIR</code> at your own folder. See <code className="text-zinc-300">sensors/CONTRIBUTING.md</code>.
              </p>
            </Panel>
          )}
        </div>
      </div>

      {catalog.errors.length > 0 && (
        <details className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm">
          <summary className="cursor-pointer text-zinc-300">{catalog.errors.length} manifest{catalog.errors.length === 1 ? "" : "s"} couldn’t be loaded</summary>
          <ul className="mt-2 space-y-2 text-xs text-zinc-400">
            {catalog.errors.map((e) => (
              <li key={e.path}><code className="text-zinc-300">{e.path}</code>: {e.problems.join(" ")}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
