"use client";

import Link from "next/link";
import { allApps } from "@/lib/focus/apps";
import { MAX_TRAP_APPS, setDesignated, type UserModel } from "@/lib/focus/model";
import type { AppId } from "@/lib/focus/types";
import { useConnectorCatalog } from "@/lib/client/connectors";
import { Panel } from "@/components/ui/primitives";
import { SitesEditor } from "./SitesEditor";

/**
 * Per-app opt-in (Privacy: designated-app signals only). An app that isn't
 * designated is invisible to FocusDeck — sensors drop it before it is sent.
 * Trap apps (two or three, Hymah v1) are the defection moments.
 */
export function AppsSection({ model, update }: { model: UserModel; update: (fn: (m: UserModel) => UserModel) => void }) {
  // Subscribing re-renders this list once connectors have registered the apps they introduce.
  useConnectorCatalog();
  const apps = allApps();
  const browserCategories = apps.filter((app) => app.group === "browser" && model.designatedApps.includes(app.id)).map((app) => app.id);
  const toggleDesignated = (id: AppId) => update((m) => setDesignated(m, id, !m.designatedApps.includes(id)));
  const toggleTrap = (id: AppId) =>
    update((m) => ({ ...m, trapApps: m.trapApps.includes(id) ? m.trapApps.filter((a) => a !== id) : [...m.trapApps, id] }));

  return (
    <Panel id="apps" title="Apps FocusDeck may notice" kicker="Per-app opt-in">
      <p className="text-sm leading-6 text-zinc-400">
        Designate only what FocusDeck should see. For a designated app it learns <em>that</em> you switched to it and when —
        never what it showed you. Pick up to {MAX_TRAP_APPS} trap apps: the ones you reach for reflexively.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead>
            <tr className="text-xs text-zinc-500">
              <th className="py-2 pr-3 font-medium">App</th>
              <th className="py-2 pr-3 font-medium">Designated</th>
              <th className="py-2 pr-3 font-medium">Trap app</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => {
              const designated = model.designatedApps.includes(app.id);
              const trap = model.trapApps.includes(app.id);
              const trapFull = !trap && model.trapApps.length >= MAX_TRAP_APPS;
              return (
                <tr key={app.id} className="border-t border-zinc-800">
                  <td className="py-2 pr-3 text-zinc-200">
                    {app.label}
                    <span className="ml-2 text-xs text-zinc-500">{app.group}{app.connector ? ` · from the ${app.connector} connector` : ""}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <input type="checkbox" aria-label={`Designate ${app.label}`} checked={designated} onChange={() => toggleDesignated(app.id)} className="h-4 w-4 accent-emerald-400" />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      aria-label={`${app.label} is a trap app`}
                      checked={trap}
                      disabled={!designated || trapFull}
                      title={!designated ? "Designate it first" : trapFull ? `At most ${MAX_TRAP_APPS} trap apps` : undefined}
                      onChange={() => toggleTrap(app.id)}
                      className="h-4 w-4 accent-amber-400 disabled:opacity-30"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        More apps arrive with connectors — see <Link href="/connect" className="text-zinc-300 underline-offset-2 hover:underline">Connect</Link>.
      </p>
      {browserCategories.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-zinc-200">Which sites count as each browser category</h3>
          <p className="mt-1 mb-3 text-xs leading-5 text-zinc-500">
            The browser connector compares each tab’s hostname with these lists inside your browser and sends only the category,
            never the address. A site and its subdomains match: x.com covers mobile.x.com.
          </p>
          <SitesEditor model={model} update={update} categories={browserCategories} />
        </div>
      )}
    </Panel>
  );
}
