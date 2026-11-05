"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MODES } from "@/lib/focus/modes";
import { useDeck } from "@/lib/client/hooks";
import { store } from "@/lib/client/store";
import { hueProps, modeTint } from "@/components/ui/modeColor";
import { Button } from "@/components/ui/primitives";

const STEPS = [
  {
    title: "Choose what it may notice",
    body: "App by app. It learns that you switched to an app, and when. Never what was on the screen.",
  },
  {
    title: "Shape your modes",
    body: "Building, Writing, Reviewing agents and more, each with its own colour and its own rule for what may interrupt.",
  },
  {
    title: "Say what you’d rather do",
    body: "In your own words. FocusDeck shows them back at the moment you reach for a distraction.",
  },
];

/** First run: what FocusDeck does, in three steps, and two honest ways in. */
export function Welcome() {
  const router = useRouter();
  const own = () => {
    store.chooseModel("blank");
    router.push("/declare");
  };
  const sample = () => {
    store.chooseModel("demo");
    store.startDemo({ scenario: "x-post" });
  };

  return (
    <div className="mx-auto max-w-4xl py-6 sm:py-12">
      <h1 className="max-w-[16ch] text-5xl leading-[1.05] font-semibold tracking-tight text-ink sm:text-6xl">
        Stay in the mode you chose.
      </h1>
      <p className="mt-6 max-w-[58ch] text-lg leading-8 text-ink-2">
        FocusDeck notices two moments: when you reach for a distraction, and when one of your agents needs you. It answers both
        with what you said you’d rather do, one tap away. It never blocks anything, and nothing leaves this browser.
      </p>

      <ol className="mt-12 grid gap-8 sm:grid-cols-3 sm:gap-6">
        {STEPS.map((step, i) => (
          <li key={step.title}>
            <span className="text-4xl font-semibold text-accent tabular-nums">{i + 1}</span>
            <h2 className="mt-2 text-base font-semibold text-ink">{step.title}</h2>
            <p className="mt-1 text-sm leading-6 text-ink-2">{step.body}</p>
            {i === 1 && (
              <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="The built-in modes">
                {MODES.map((m) => (
                  <li key={m.id} {...hueProps(modeTint(MODES, m.id))} className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs text-ink">
                    <span aria-hidden className="size-2 rounded-full bg-accent" />
                    {m.label}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-12 flex flex-wrap gap-3">
        <Button variant="primary" size="lg" onClick={own}>Set up my own, about 2 minutes</Button>
        <Button size="lg" onClick={sample}>Watch a sample day</Button>
      </div>
      <p className="mt-3 max-w-[60ch] text-sm leading-6 text-ink-3">
        The sample uses a ready-made setup that notices every built-in app. You can change any of it later in Setup.
      </p>
    </div>
  );
}

/** Only while something is missing: the few steps that make FocusDeck useful, each one link away. */
export function SetupNudge() {
  const { state, isDemo } = useDeck();
  const { model, bridge } = state;
  const heard = Object.values(bridge.stats?.byConnector ?? {}).some((s) => s.lastEventAt);
  const steps = [
    { done: model.designatedApps.length > 0, label: "Choose apps it may notice", href: "/declare#apps" },
    { done: model.trapApps.length > 0, label: "Pick your distractions", href: "/declare#apps" },
    { done: model.queue.length > 0, label: "Add something you’d rather do", href: "/declare#queue" },
    { done: model.intentions.some((i) => i.enabled), label: "Write an if-then plan", href: "/declare#intentions" },
    { done: model.connectors.length > 0 || heard, label: "Connect a sensor", href: "/connect" },
  ];
  const left = steps.filter((s) => !s.done).length;
  if (left === 0 || isDemo) return null;

  return (
    <section aria-labelledby="nudge-title" className="rounded-2xl border border-line p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="nudge-title" className="text-base font-semibold text-ink">Finish setting up</h2>
        <span className="text-sm text-ink-3 tabular-nums">{steps.length - left} of {steps.length} done</span>
      </div>
      <div className="mt-3 flex gap-1" aria-hidden>
        {steps.map((s) => (
          <span key={s.label} className={`h-1 flex-1 rounded-full ${s.done ? "bg-accent" : "bg-line"}`} />
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {steps
          .filter((s) => !s.done)
          .map((s) => (
            <li key={s.label} className="flex items-center gap-2.5 text-sm">
              <span aria-hidden className="size-4 rounded-full ring-1 ring-line-strong ring-inset" />
              <Link href={s.href} className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-accent">{s.label}</Link>
            </li>
          ))}
      </ul>
    </section>
  );
}
