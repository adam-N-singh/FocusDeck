"use client";

import { useState } from "react";
import { appLabel } from "@/lib/focus/apps";
import type { UserModel } from "@/lib/focus/model";
import { addSite, removeSite } from "@/lib/focus/sites";
import type { AppId } from "@/lib/focus/types";
import { CloseIcon } from "@/components/ui/icons";
import { Button, inputClass } from "@/components/ui/primitives";

type Update = (fn: (m: UserModel) => UserModel) => void;

function SiteList({ category, model, update }: { category: AppId; model: UserModel; update: Update }) {
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const sites = model.sites[category] ?? [];
  const name = appLabel(category);
  const add = () => {
    const { host } = addSite(model.sites, category, draft);
    if (!host) {
      setNote("That doesn’t look like a website. Try x.com or docs.github.com.");
      return;
    }
    const elsewhere = Object.entries(model.sites).find(([key, list]) => key !== category && list.includes(host));
    update((m) => ({ ...m, sites: addSite(m.sites, category, draft).sites }));
    setDraft("");
    setNote(elsewhere ? `Moved ${host} here from ${appLabel(elsewhere[0])}.` : null);
  };

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <h4 className="text-sm font-medium text-ink">{name}</h4>
      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={`Sites for ${name}`}>
        {sites.length === 0 && <li className="text-sm text-ink-3">No sites yet, so nothing counts as {name}.</li>}
        {sites.map((host) => (
          <li key={host} className="inline-flex h-7 items-center gap-1 rounded-full bg-sunk pr-1 pl-3 text-sm text-ink ring-1 ring-line ring-inset">
            {host}
            <button
              type="button"
              aria-label={`Remove ${host} from ${name}`}
              onClick={() => update((m) => ({ ...m, sites: removeSite(m.sites, category, host) }))}
              className="grid size-5 place-items-center rounded-full text-ink-3 transition-colors hover:bg-line hover:text-ink"
            >
              <CloseIcon size={12} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a site, like x.com" className={inputClass} aria-label={`Add a site to ${name}`} />
        <Button type="submit" disabled={!draft.trim()}>Add</Button>
      </form>
      {note && <p className="mt-2 text-sm text-ink-2" aria-live="polite">{note}</p>}
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
      {categories.map((category) => (
        <SiteList key={category} category={category} model={model} update={update} />
      ))}
    </div>
  );
}
