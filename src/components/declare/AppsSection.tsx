"use client";

import Link from "next/link";
import { allApps, type AppGroup } from "@/lib/focus/apps";
import { MAX_TRAP_APPS, setDesignated, type UserModel } from "@/lib/focus/model";
import type { AppId } from "@/lib/focus/types";
import { useConnectorCatalog } from "@/lib/client/connectors";
import { Group, Section } from "@/components/ui/primitives";
import { Switch, type Update } from "./controls";
import { SitesEditor } from "./SitesEditor";

const GROUP_WORD: Record<AppGroup, string> = {
  work: "Work",
  agents: "AI agent",
  comms: "Messages and calendar",
  browser: "Websites, by category",
  tasks: "Tasks and reviews",
};

/**
 * Per-app opt-in (designated-app signals only): an app you haven't turned on
 * is invisible to FocusDeck, because sensors drop it before it is sent. Of
 * the apps it notices, up to three can be distractions — the defection moments.
 */
export function AppsSection({ model, update }: { model: UserModel; update: Update }) {
  // Subscribing re-renders this list once connectors have registered the apps they introduce.
  const catalog = useConnectorCatalog();
  const apps = allApps();
  const trapFull = model.trapApps.length >= MAX_TRAP_APPS;
  const browserCategories = apps.filter((app) => app.group === "browser" && model.designatedApps.includes(app.id)).map((app) => app.id);
  const connectorName = (id: string) => catalog.connectors.find((c) => c.id === id)?.name ?? id;
  const notice = (id: AppId, on: boolean) => update((m) => setDesignated(m, id, on));
  const distract = (id: AppId, on: boolean) =>
    update((m) => {
      if (on && (m.trapApps.includes(id) || m.trapApps.length >= MAX_TRAP_APPS || !m.designatedApps.includes(id))) return m;
      return { ...m, trapApps: on ? [...m.trapApps, id] : m.trapApps.filter((a) => a !== id) };
    });

  return (
    <Section
      title="Apps and distractions"
      description={`FocusDeck only notices the apps you turn on here. For those, it learns that you switched and when, never what was on screen. Mark up to ${MAX_TRAP_APPS} as distractions: the ones you reach for without thinking.`}
    >
      <Group label="Apps FocusDeck may notice">
        <li className="flex items-center gap-4 bg-sunk/60 px-4 py-2 text-xs text-ink-3" aria-hidden>
          <span className="flex-1">App</span>
          <span className="w-12 text-center">Notice</span>
          <span className="w-20 text-center">Distraction</span>
        </li>
        {apps.map((app) => {
          const designated = model.designatedApps.includes(app.id);
          const trap = model.trapApps.includes(app.id);
          return (
            <li key={app.id} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${designated ? "text-ink" : "text-ink-2"}`}>{app.label}</p>
                <p className="text-xs leading-5 text-ink-3">
                  {GROUP_WORD[app.group] ?? app.group}
                  {app.connector ? `, from the ${connectorName(app.connector)} connector` : ""}
                </p>
              </div>
              <span className="flex w-12 justify-center">
                <Switch checked={designated} onChange={(on) => notice(app.id, on)} label={`Notice ${app.label}`} />
              </span>
              <span className="flex w-20 justify-center">
                {designated && (
                  <Switch
                    checked={trap}
                    onChange={(on) => distract(app.id, on)}
                    label={`${app.label} is a distraction`}
                    disabled={!trap && trapFull}
                    title={!trap && trapFull ? `You already have ${MAX_TRAP_APPS} distractions` : undefined}
                  />
                )}
              </span>
            </li>
          );
        })}
      </Group>
      <div className="mt-3 max-w-[64ch] space-y-1 text-sm leading-6 text-ink-3">
        {trapFull && (
          <p className="text-ink-2" aria-live="polite">
            You have {MAX_TRAP_APPS} distractions, the most FocusDeck watches. It watches a few moments well rather than everything; turn one off to choose another.
          </p>
        )}
        <p>
          More apps arrive with connectors.{" "}
          <Link href="/connect" className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-accent">
            Find them in Connect
          </Link>
          .
        </p>
      </div>

      {browserCategories.length > 0 && (
        <div className="mt-10">
          <h3 className="text-base font-semibold text-ink">Which sites count as each category</h3>
          <p className="mt-1 max-w-[64ch] text-sm leading-6 text-ink-2">
            Your browser connector checks each tab’s address against these lists inside the browser and sends only the category, never the
            address. A site covers its subdomains: x.com covers mobile.x.com.
          </p>
          <div className="mt-4">
            <SitesEditor model={model} update={update} categories={browserCategories} />
          </div>
        </div>
      )}
    </Section>
  );
}
