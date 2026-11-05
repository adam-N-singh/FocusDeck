"use client";

import { useMemo, useState } from "react";
import { deriveHypotheses } from "@/lib/focus/learn";
import { summarizeLoops } from "@/lib/focus/loops";
import { applyProposal, buildProposalPayload, type SystemTwoProposal } from "@/lib/systemTwo/proposals";
import type { AppState } from "@/lib/client/store";
import { store } from "@/lib/client/store";
import { newId, requestProposals } from "@/lib/client/systemTwoClient";
import { Badge, Button, Group, Section } from "@/components/ui/primitives";

/**
 * The confirmation gate: anything learned from your days, or drafted by the
 * AI helper, waits here — visible and inactive — until you confirm it.
 * Shared by the list at the top of Setup and the ask button in Rhythm.
 */
export function useSuggestions(state: AppState) {
  const { model, live, history } = state;
  const hypotheses = useMemo(() => deriveHypotheses({ model, deck: live, history }), [model, live, history]);
  const [drafts, setDrafts] = useState<SystemTwoProposal[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const ask = async () => {
    setBusy(true);
    setNote(null);
    const result = await requestProposals(buildProposalPayload(model, live, summarizeLoops(live.loops, live.clock).meanTimeToCloseMinutes));
    setBusy(false);
    if (!result) return setNote("The AI helper isn’t reachable right now. Check it in Connect.");
    setDrafts(result.proposals);
    if (result.note) setNote(result.note);
    else if (result.proposals.length === 0) setNote("Nothing in your days supports a change right now. That’s a fine answer.");
    else {
      setNote(`${result.proposals.length} suggestion${result.proposals.length === 1 ? "" : "s"} from ${result.model}, at the top of this page.`);
      requestAnimationFrame(() => document.getElementById("proposals")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  const confirmDraft = (proposal: SystemTwoProposal) => {
    const next = applyProposal(store.getSnapshot().model, proposal, newId("i"));
    if (!next) return setNote(`“${proposal.title}” no longer fits your setup, so it wasn’t applied.`);
    store.setModel(next);
    setDrafts((d) => d.filter((p) => p.id !== proposal.id));
  };

  const dropDraft = (id: string) => setDrafts((d) => d.filter((p) => p.id !== id));

  return { hypotheses, drafts, busy, note, ask, confirmDraft, dropDraft, canAsk: model.systemTwoEnabled };
}

export type Suggestions = ReturnType<typeof useSuggestions>;

function whatItDoes(p: SystemTwoProposal) {
  if (p.kind === "new-mode") return <>Adds a mode called {p.label}.</>;
  if (p.kind === "new-intention") return <>Adds the if-then plan <span className="voice">“{p.intention.text}”</span>.</>;
  return <>Rewords an if-then plan as <span className="voice">“{p.text}”</span>.</>;
}

/** Only on screen when something is waiting for your yes or no. */
export function ProposalsSection({ suggestions }: { suggestions: Suggestions }) {
  const { hypotheses, drafts, confirmDraft, dropDraft } = suggestions;
  if (hypotheses.length + drafts.length === 0) return null;

  return (
    <Section title="Suggestions" description="Learned from your days, or drafted by the AI helper. Nothing changes until you confirm it.">
      <Group label="Suggestions waiting for you">
        {hypotheses.map((h) => (
          <li key={h.id} className="px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-medium text-ink">{h.statement}</p>
              <Badge tone="accent">From your days</Badge>
            </div>
            <p className="mt-1 max-w-[64ch] text-sm leading-6 text-ink-2">{h.evidence}</p>
            <p className="mt-1 max-w-[64ch] text-sm leading-6 text-ink">If you confirm: {h.change}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="primary" onClick={() => store.decideHypothesis(h, true)}>Confirm</Button>
              <Button size="sm" onClick={() => store.decideHypothesis(h, false)}>Not for me</Button>
            </div>
          </li>
        ))}
        {drafts.map((p) => (
          <li key={p.id} className="px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-medium text-ink">{p.title}</p>
              <Badge tone="outline">From the AI helper</Badge>
            </div>
            <p className="mt-1 max-w-[64ch] text-sm leading-6 text-ink-2">{p.rationale}</p>
            <p className="mt-1 max-w-[64ch] text-sm leading-6 text-ink">If you confirm: {whatItDoes(p)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="primary" onClick={() => confirmDraft(p)}>Confirm</Button>
              <Button size="sm" onClick={() => dropDraft(p.id)}>Not for me</Button>
            </div>
          </li>
        ))}
      </Group>
    </Section>
  );
}
