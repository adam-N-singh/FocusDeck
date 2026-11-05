"use client";

import { useEffect, useState, type ReactNode } from "react";
import { validateModel, type UserModel } from "@/lib/focus/model";
import { useAppState } from "@/lib/client/hooks";
import { store } from "@/lib/client/store";
import { newId } from "@/lib/client/systemTwoClient";
import { CheckIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/primitives";
import { AppsSection } from "./AppsSection";
import { TextButton } from "./controls";
import { IntentionsSection } from "./IntentionsSection";
import { ModesSection } from "./ModesSection";
import { ProposalsSection, useSuggestions } from "./ProposalsSection";
import { QueueSection } from "./QueueSection";
import { RhythmSection } from "./RhythmSection";

interface IndexItem {
  id: string;
  label: string;
  done: boolean;
  count?: number;
}

/** Highlights the section you're reading in the index. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join(",");
  useEffect(() => {
    const sections = key.split(",").map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [key]);
  return active;
}

/** Done or not, at a glance: a filled check, or an empty ring still to fill. */
function Mark({ done, count }: { done: boolean; count?: number }) {
  if (count !== undefined) {
    return <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-ink tabular-nums">{count}</span>;
  }
  return (
    <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-full ${done ? "bg-accent-soft text-accent" : "ring-1 ring-line-strong ring-inset"}`}>
      {done && <CheckIcon size={12} />}
    </span>
  );
}

function SectionIndex({ items, active }: { items: IndexItem[]; active: string | null }) {
  return (
    <nav
      aria-label="Setup sections"
      className="sticky top-14 z-30 -mx-4 mb-10 border-b border-line bg-bg/90 px-4 backdrop-blur-lg sm:-mx-6 sm:px-6 lg:top-24 lg:mx-0 lg:mb-0 lg:self-start lg:border-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none"
    >
      <ul className="no-scrollbar flex gap-1 overflow-x-auto py-2 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:py-0">
        {items.map((item) => {
          const current = active === item.id;
          return (
            <li key={item.id} className="shrink-0">
              <a
                href={`#${item.id}`}
                aria-current={current ? "location" : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors ${
                  current ? "bg-accent-soft font-medium text-ink" : "text-ink-2 hover:bg-ink/[0.04] hover:text-ink"
                }`}
              >
                <Mark done={item.done} count={item.count} />
                {item.label}
                <span className="sr-only">{item.count !== undefined ? `, ${item.count} waiting` : item.done ? ", done" : ", not set up yet"}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Each section carries its own anchor offset, clearing the header and, on narrow screens, the index bar. */
function Anchor({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-32 lg:scroll-mt-24">
      {children}
    </div>
  );
}

/** Setup — the calm-moment step of the core loop. Every edit saves to your model at once. */
export function DeclareView() {
  const state = useAppState();
  const suggestions = useSuggestions(state);
  const waiting = suggestions.hypotheses.length + suggestions.drafts.length;
  const { model } = state;

  const items: IndexItem[] = [
    ...(waiting > 0 ? [{ id: "proposals", label: "Suggestions", done: false, count: waiting }] : []),
    { id: "apps", label: "Apps & distractions", done: model.designatedApps.length > 0 && model.trapApps.length > 0 },
    { id: "modes", label: "Modes", done: model.modes.length > 0 },
    { id: "intentions", label: "If-then plans", done: model.intentions.some((i) => i.enabled) },
    { id: "queue", label: "Things you’d rather do", done: model.queue.length > 0 },
    { id: "rhythm", label: "Rhythm", done: true },
  ];
  const active = useActiveSection(state.hydrated ? items.map((i) => i.id) : []);

  if (!state.hydrated) {
    return (
      <div className="mt-10 max-w-2xl">
        <Skeleton lines={6} />
      </div>
    );
  }

  const update = (fn: (m: UserModel) => UserModel) => store.setModel(fn(store.getSnapshot().model));
  const problems = validateModel(model);

  return (
    <div className="mt-10 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14">
      <SectionIndex items={items} active={active} />
      <div className="min-w-0 space-y-16">
        {problems.length > 0 && (
          <div role="status" className="rounded-2xl border border-attention/35 bg-attention-soft/50 p-5">
            <h2 className="text-base font-semibold text-ink">
              {problems.length === 1 ? "One thing doesn’t fit together yet" : `${problems.length} things don’t fit together yet`}
            </h2>
            <ul className="mt-2 max-w-[64ch] list-disc space-y-1 pl-5 text-sm leading-6 text-ink-2">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm leading-6 text-ink-3">FocusDeck keeps running and ignores whatever doesn’t fit until it does.</p>
          </div>
        )}
        {waiting > 0 && (
          <Anchor id="proposals">
            <ProposalsSection suggestions={suggestions} />
          </Anchor>
        )}
        <Anchor id="apps">
          <AppsSection model={model} update={update} />
        </Anchor>
        <Anchor id="modes">
          <ModesSection model={model} update={update} newId={newId} />
        </Anchor>
        <Anchor id="intentions">
          <IntentionsSection model={model} update={update} newId={newId} />
        </Anchor>
        <Anchor id="queue">
          <QueueSection model={model} update={update} newId={newId} />
        </Anchor>
        <Anchor id="rhythm">
          <RhythmSection model={model} update={update} suggestions={suggestions} />
        </Anchor>
        <p className="border-t border-line pt-6 text-sm leading-6 text-ink-3">
          Want a fresh start?{" "}
          <TextButton onClick={() => window.confirm("Replace your setup with the sample one? Your history and today stay as they are.") && store.chooseModel("demo")}>
            Use the sample setup
          </TextButton>{" "}
          or{" "}
          <TextButton onClick={() => window.confirm("Replace your setup with a blank one? Your history and today stay as they are.") && store.chooseModel("blank")}>
            start blank
          </TextButton>
          . Your history and today stay as they are.
        </p>
      </div>
    </div>
  );
}
