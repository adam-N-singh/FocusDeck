"use client";

import { useMemo, useState } from "react";
import { deriveHypotheses } from "@/lib/focus/learn";
import { summarizeLoops } from "@/lib/focus/loops";
import { buildProposalPayload, applyProposal, type SystemTwoProposal } from "@/lib/systemTwo/proposals";
import { useAppState } from "@/lib/client/hooks";
import { store } from "@/lib/client/store";
import { newId, requestProposals } from "@/lib/client/systemTwoClient";
import { Badge, Button, Panel } from "@/components/ui/primitives";

/**
 * Layer 4, the confirmation gate (Hymah North-Star §6): anything learned or
 * drafted waits here, visible and inactionable, until you confirm it.
 */
export function ProposalsSection() {
  const state = useAppState();
  const { model, live, history } = state;
  const hypotheses = useMemo(() => deriveHypotheses({ model, deck: live, history }), [model, live, history]);
  const [drafts, setDrafts] = useState<SystemTwoProposal[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const askSystemTwo = async () => {
    setBusy(true);
    setNote(null);
    const result = await requestProposals(buildProposalPayload(model, live, summarizeLoops(live.loops, live.clock).meanTimeToCloseMinutes));
    setBusy(false);
    if (!result) return setNote("System Two isn't reachable right now.");
    setDrafts(result.proposals);
    setNote(result.note ?? (result.proposals.length === 0 ? "Nothing in your data supports a change right now — that's a fine answer." : `Drafted by ${result.model}.`));
  };
  const confirmDraft = (proposal: SystemTwoProposal) => {
    const next = applyProposal(model, proposal, newId("i"));
    if (!next) return setNote(`“${proposal.title}” no longer fits your model, so it wasn't applied.`);
    store.setModel(next);
    setDrafts((d) => d.filter((p) => p.id !== proposal.id));
  };

  return (
    <Panel id="proposals" title="Proposals waiting for you" kicker="Nothing changes until you confirm">
      {hypotheses.length === 0 && drafts.length === 0 && (
        <p className="text-sm text-zinc-400">No proposals right now. FocusDeck proposes only when your own patterns point at a change.</p>
      )}
      <ul className="space-y-3">
        {hypotheses.map((h) => (
          <li key={h.id} className="rounded-xl bg-zinc-950/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="sky">Learned from your day</Badge>
              <span className="text-sm font-medium text-zinc-100">{h.statement}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-zinc-400">{h.evidence}</p>
            <p className="mt-1 text-xs leading-5 text-zinc-300">If you confirm: {h.change}</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="primary" onClick={() => store.decideHypothesis(h, true)}>Confirm</Button>
              <Button size="sm" onClick={() => store.decideHypothesis(h, false)}>Not for me</Button>
            </div>
          </li>
        ))}
        {drafts.map((p) => (
          <li key={p.id} className="rounded-xl bg-zinc-950/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="violet">Drafted by System Two</Badge>
              <span className="text-sm font-medium text-zinc-100">{p.title}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-zinc-400">{p.rationale}</p>
            <p className="mt-1 text-xs leading-5 text-zinc-300">
              {p.kind === "new-mode" ? `Adds a mode “${p.label}”.` : p.kind === "new-intention" ? `Adds the intention “${p.intention.text}”.` : `Rewords an intention as “${p.text}”.`}
            </p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="primary" onClick={() => confirmDraft(p)}>Confirm</Button>
              <Button size="sm" onClick={() => setDrafts((d) => d.filter((x) => x.id !== p.id))}>Not for me</Button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button size="sm" disabled={!model.systemTwoEnabled || busy} onClick={() => void askSystemTwo()}>
          {busy ? "Asking System Two…" : "Ask System Two for drafts"}
        </Button>
        {!model.systemTwoEnabled && <span className="text-xs text-zinc-500">Turn on System Two above to ask for drafts.</span>}
        {note && <span className="text-xs text-zinc-400" aria-live="polite">{note}</span>}
      </div>
    </Panel>
  );
}
