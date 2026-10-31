const COLUMNS: { title: string; items: string[] }[] = [
  {
    title: "FROM HYMAH (THE SOUL)",
    items: [
      "Declare → Notice → Offer → Learn → Show",
      "Replacement, never restriction — dismiss is sacred",
      "Your implementation intention, in your own words",
      "Privacy constitution: content is never read, ever",
      "Honest mirror: trend + state word, misses counted",
    ],
  },
  {
    title: "FROM THE X POSTS (THE ENVIRONMENT)",
    items: [
      "Modes: Building / Writing / Reviewing-agents / Comms",
      "Real-time classification of activity + notifications",
      "Agents as first-class signals, not apps",
      "Switch counting as evidence — the 506",
      "The 20-switch warning, in a rolling hour",
    ],
  },
  {
    title: "NEW IN THE COMBINATION",
    items: [
      "Mode-scoped intentions: “when I open X during Building…”",
      "Three triggers, one offer engine",
      "Open loops: agents' claims on you, batched to a review moment",
      "Mode-relative counting: same switch, different cost",
      "Supervision as a declared mode, not an interruption",
    ],
  },
];

/**
 * What this product is: a combination, not a copy. Neither a macOS dock
 * replica nor a Hymah mobile port — Hymah's engine in the agent-heavy
 * desktop environment. See PRODUCT.md for the full definition.
 */
export function SynthesisPanel() {
  return (
    <section aria-label="How the combination works" className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <h2 className="text-sm font-semibold tracking-wide text-zinc-200">A COMBINATION, NOT A COPY</h2>
      <p className="mt-1 text-sm leading-6 text-zinc-500">
        Not the X post&apos;s dock, and not Hymah on desktop. Hymah contributes the engine and the
        constitution; the X posts contribute the environment — modes, agents, and measured switching.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {COLUMNS.map((column) => (
          <div key={column.title} className="rounded-xl bg-zinc-950/60 p-4">
            <h3 className="text-xs font-semibold tracking-wide text-emerald-400">{column.title}</h3>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm leading-6 text-zinc-400">
              {column.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm leading-6 text-zinc-400">
        Two moments, one engine: you open X while an agent runs (<span className="text-zinc-200">defection</span>),
        or an agent blocks while you build (<span className="text-zinc-200">interruption</span>). Either way you get
        the same thing — your own declared intention, one tap away, or batched as an open loop for your review moment.
      </p>
    </section>
  );
}
