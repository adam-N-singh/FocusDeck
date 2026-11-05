"use client";

import Link from "next/link";
import { appLabel } from "@/lib/focus/apps";
import type { Offer } from "@/lib/focus/deck/state";
import { useDeck } from "@/lib/client/hooks";
import { store } from "@/lib/client/store";
import { clockLabel } from "@/lib/client/time";
import { Button, Disclosure, Dot } from "@/components/ui/primitives";

const safeUrl = (url?: string) => (url && /^https?:\/\//i.test(url) ? url : null);

/** What just happened, in a few words, so the offer never arrives out of nowhere. */
function occasion(offer: Offer): string {
  switch (offer.trigger) {
    case "defection":
      return offer.trapApp ? `You opened ${appLabel(offer.trapApp)}` : "You reached for a distraction";
    case "interruption":
      return offer.loopId ? "An agent is waiting on you" : "This one can’t wait";
    case "review-moment":
      return "Time for your review";
    case "mode-transition":
      return "You just switched modes";
    case "warning":
      return "A lot of switching this hour";
  }
}

/**
 * The one card. Your own words come first, in your voice; then the smallest
 * next step. Accept and Not now are the same size and cost the same single
 * tap. Nothing is blocked, and setting it aside is never held against you.
 */
function OfferCard({ offer }: { offer: Offer }) {
  const url = safeUrl(offer.url);
  const accept = () => {
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    store.dispatch({ type: "accept-offer", at: store.now() });
  };
  const dismiss = () => store.dispatch({ type: "dismiss-offer", at: store.now() });

  return (
    <article
      key={offer.id}
      aria-labelledby="offer-title"
      className="arrive rounded-[28px] border border-accent-line bg-surface p-6 shadow-[0_28px_70px_-36px_var(--shadow)] sm:p-8"
    >
      <p className="flex items-center gap-2 text-sm text-ink-2" aria-live="polite">
        <Dot tone={offer.loopId ? "attention" : "accent"} />
        {occasion(offer)}
      </p>
      {offer.said && (
        <p className="mt-5 text-xl leading-8 text-ink">
          <span className="text-base text-ink-3">You said </span>
          <span className="voice">“{offer.said}”</span>
        </p>
      )}
      <h2 id="offer-title" className={`${offer.said ? "mt-4" : "mt-5"} text-2xl font-semibold tracking-tight text-ink`}>
        {offer.title}
      </h2>
      {offer.detail && <p className="mt-2 max-w-[60ch] text-base leading-7 text-ink-2">{offer.detail}</p>}
      <div className="mt-7 grid gap-2 sm:grid-cols-2">
        <Button variant="primary" size="lg" onClick={accept}>
          <span>{offer.microAction}</span>
          {offer.estimatedMinutes ? <span className="font-normal whitespace-nowrap opacity-75">about {offer.estimatedMinutes} min</span> : null}
        </Button>
        <Button size="lg" onClick={dismiss}>Not now</Button>
      </div>
      <Disclosure title="Why this?" className="mt-4">
        <p className="max-w-[62ch] text-sm leading-6 text-ink-2">{offer.trace}</p>
        <p className="mt-2 max-w-[62ch] text-sm leading-6 text-ink-3">
          Both buttons cost one tap, and Not now is never held against you.{url ? " The first one also opens the link itself." : ""}
        </p>
      </Disclosure>
    </article>
  );
}

/** Where the offer appears. When there's nothing to offer, it says so, and says what would change that. */
function CalmState() {
  const { state, deck } = useDeck();
  const blind = state.model.designatedApps.length === 0;
  return (
    <div className="rounded-[28px] border border-dashed border-line-strong/70 px-6 py-9 sm:px-8">
      {blind ? (
        <>
          <p className="text-2xl font-semibold tracking-tight text-ink">FocusDeck can’t see anything yet.</p>
          <p className="mt-2 max-w-[52ch] text-base leading-7 text-ink-2">
            It only notices apps you choose. Pick a few in{" "}
            <Link href="/declare#apps" className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-accent">
              Setup
            </Link>
            , and it will start to speak up when it matters.
          </p>
        </>
      ) : (
        <>
          <p className="text-2xl font-semibold tracking-tight text-ink">{deck.paused ? "Paused." : "Nothing needs you."}</p>
          <p className="mt-2 max-w-[52ch] text-base leading-7 text-ink-2" aria-live="polite">
            {deck.paused
              ? "Resume when you want FocusDeck to hold things back and offer again."
              : deck.note ?? "FocusDeck speaks up when you reach for a distraction, when an agent needs you, or when your review comes round."}
          </p>
        </>
      )}
    </div>
  );
}

export function Moment() {
  const { deck } = useDeck();
  return deck.offer ? <OfferCard offer={deck.offer} /> : <CalmState />;
}

/** At most one question a day, asked only as you change modes, never mid-flow. */
export function QuestionCard() {
  const { deck, isDemo } = useDeck();
  const question = deck.pendingQuestion;
  if (!question) return null;
  return (
    <section aria-labelledby="question-title" className="arrive rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <p className="text-sm text-ink-2">Today’s one question</p>
      <h2 id="question-title" className="mt-2 text-lg leading-7 font-medium text-ink">{question.text}</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => store.answerQuestion("yes")}>Yes</Button>
        <Button onClick={() => store.answerQuestion("no")}>No</Button>
        <Button variant="ghost" onClick={() => store.answerQuestion("skipped")}>Not now</Button>
      </div>
      <p className="mt-3 text-sm leading-6 text-ink-3">
        Your answer goes into your setup, where you can change it anytime.{isDemo ? " In a sample day, answers stay in the sample." : ""}
      </p>
    </section>
  );
}

/** Things that were held back, now released by your review or a mode change. */
export function ReadyCard() {
  const { deck } = useDeck();
  const ready = deck.held.filter((h) => h.releasedAtMinute !== undefined && !h.acknowledged);
  if (ready.length === 0) return null;
  return (
    <section aria-labelledby="ready-title" className="rounded-2xl border border-accent-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ready-title" className="text-lg font-semibold text-ink">Back from hold</h2>
        <Button size="sm" onClick={() => store.dispatch({ type: "acknowledge-released", at: store.now() })}>Got it</Button>
      </div>
      <ul className="mt-3 space-y-2">
        {ready.map((item) => (
          <li key={item.id} className="grid grid-cols-[3.25rem_1fr] gap-2 text-sm">
            <span className="text-ink-3 tabular-nums">{clockLabel(item.atMinute)}</span>
            <span className="text-ink">
              {item.label}
              <span className="text-ink-3">, released by your {item.releasedBy === "review-moment" ? "review" : "mode change"}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
