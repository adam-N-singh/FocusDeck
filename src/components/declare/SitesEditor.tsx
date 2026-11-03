"use client";

import { useState } from "react";
import { appLabel } from "@/lib/focus/apps";
import type { UserModel } from "@/lib/focus/model";
import { addSite, removeSite } from "@/lib/focus/sites";
import type { AppId } from "@/lib/focus/types";
import { Button, inputClass } from "@/components/ui/primitives";

type Update = (fn: (m: UserModel) => UserModel) => void;

function SiteList({ category, model, update }: { category: AppId; model: UserModel; update: Update }) {
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const sites = model.sites[category] ?? [];
  const add = () => {
    const { host } = addSite(model.sites, category, draft);
    if (!host) {
      setNote("That doesn't look like a website. Try x.com or docs.github.com.");
      return;
    }
    const elsewhere = Object.entries(model.sites).find(([key, list]) => key !== category && list.includes(host));
    update((m) => ({ ...m, sites: addSite(m.sites, category, draft).sites }));
    setDraft("");
    setNote(elsewhere ? `Moved ${host} here from ${appLabel(elsewhere[0])}.` : null);
  };
  return (
    <div className="rounded-xl bg-zinc-950/60 p-3">
      <h4 className="text-sm font-medium text-zinc-200">{appLabel(category)}</h4>
      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`Sites for ${appLabel(category)}`}>
        {sites.length === 0 && <li className="text-xs text-zinc-500">No sites yet, so nothing counts as {appLabel(category)}.</li>}
        {sites.map((host) => (
          <li key={host} className="inline-flex items-center gap-1 rounded-full bg-zinc-800 py-1 pr-1.5 pl-2.5 text-xs text-zinc-200">
            {host}
            <button
              type="button"
              aria-label={`Remove ${host}`}
              onClick={() => update((m) => ({ ...m, sites: removeSite(m.sites, category, host) }))}
              className="rounded-full px-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-100"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a site, e.g. x.com" className={inputClass} aria-label={`Add a site to ${appLabel(category)}`} />
        <Button size="sm" type="submit" disabled={!draft.trim()}>Add</Button>
      </form>
      {note && <p className="mt-1.5 text-xs text-zinc-400">{note}</p>}
    </div>
  );
}

/**
 * Which websites count as each browser category. Your browser connector
 * compares the tab's hostname with these lists inside the browser and sends
 * only the category, never the address (sites.ts).
 */
export function SitesEditor({ model, update, categories }: { model: UserModel; update: Update; categories: AppId[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {categories.map((category) => <SiteList key={category} category={category} model={model} update={update} />)}
    </div>
  );
}
