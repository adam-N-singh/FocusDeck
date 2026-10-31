"use client";

import type { OfferTrigger } from "@/lib/focus/governor";
import { useDeck } from "@/lib/client/hooks";
import { store } from "@/lib/client/store";
import { Button, Panel } from "@/components/ui/primitives";

const TRIGGER: Record<OfferTrigger, string> = {
  defection: "Defection moment",
  interruption: "Interruption moment",
  "review-moment": "Review moment",
  "mode-transition": "Mode transition",
  warning: "A gentle signal",
};

const safeUrl = (url?: string) => (url && /^https?:\/\//i.test(url) ? url : null);

/**
 * The offer surface, Hymah-style (v1 Spec §3.3): your own words verbatim,
 * exactly one offer, the smallest next step, and friction asymmetry —
 * Accept *is* the next step and costs one tap, the same as Not now.
 * Dismiss is sacred: instant, silent, never penalized. Nothing is blocked.
 */
export function OfferCard() {
  const { deck, state } = useDeck();
  const offer = deck.offer;
  if (!state.hydrated) return null;

  if (!offer) {
    return (
      <Panel title="The offer" kicker="One thing at a time">
        <p className="text-sm leading-6 text-zinc-400" aria-live="polite">
          {deck.note ?? "Nothing to offer right now. FocusDeck only speaks at a defection moment, an interruption your mode allows, or a review moment."}
        </p>
      </Panel>
    );
  }

  const url = safeUrl(offer.url);
  const accept = () => {
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    store.dispatch({ type: "accept-offer", at: store.now() });
  };
  const dismiss = () => store.dispatch({ type: "dismiss-offer", at: store.now() });

  return (
    <Panel title="The offer" kicker={TRIGGER[offer.trigger]} tone="accent">
      <div aria-live="polite">
        {offer.said && (
          <p className="text-sm leading-6 text-zinc-400">
            You said: <span className="text-zinc-100">“{offer.said}”</span>
          </p>
        )}
        <p className="mt-3 text-xl font-medium text-zinc-50">{offer.title}</p>
        {offer.detail && <p className="mt-1 text-sm leading-6 text-zinc-400">{offer.detail}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={accept}>
            {offer.microAction}
            {offer.estimatedMinutes ? <span className="font-normal opacity-70"> · ~{offer.estimatedMinutes} min</span> : null}
          </Button>
          <Button onClick={dismiss}>Not now</Button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Both are one tap. “Not now” is never penalized — it’s logged quietly as signal{url ? "; accepting opens the thing itself" : ""}.
        </p>
        <details className="mt-3 text-xs text-zinc-500">
          <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200">Why this?</summary>
          <p className="mt-1 leading-5">{offer.trace}</p>
        </details>
      </div>
    </Panel>
  );
}

/** Today's one question — asked only at a mode boundary, never mid-flow (Hymah Spec §3.5). */
export function QuestionCard() {
  const { deck, isDemo } = useDeck();
  const question = deck.pendingQuestion;
  if (!question) return null;
  return (
    <Panel title="Today's one question" kicker="Asked at a boundary">
      <p className="text-base text-zinc-100">{question.text}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => store.answerQuestion("yes")}>Yes</Button>
        <Button onClick={() => store.answerQuestion("no")}>No</Button>
        <Button variant="ghost" onClick={() => store.answerQuestion("skipped")}>Not now</Button>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        At most one question a day. Your answer goes into your model, where you can change it anytime.
        {isDemo ? " (In a demo, answers stay in the demo.)" : ""}
      </p>
    </Panel>
  );
}
