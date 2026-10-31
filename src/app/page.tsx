import { DemoBanner, OnboardingCard } from "@/components/deck/DemoAndOnboarding";
import { HeldPanel, OpenLoopsPanel } from "@/components/deck/LoopsAndHeld";
import { LiveModeDock } from "@/components/deck/LiveModeDock";
import { OfferCard, QuestionCard } from "@/components/deck/OfferCard";
import { SourcesPanel } from "@/components/deck/SourcesPanel";
import { ActivityLog, TodayPanel } from "@/components/deck/TodayAndLog";

/**
 * Now — the live deck. Notice → classify in mode → offer or batch, as it
 * happens: the mode dock, the one offer, the open loops, what's held, today's
 * mode-relative counters, and the log of every decision. Composition only.
 */
export default function NowPage() {
  return (
    <div className="space-y-4">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold tracking-widest text-emerald-400">HYMAH × MODES × AGENTS — A COMBINATION, NOT A COPY</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">Now</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          FocusDeck notices two kinds of moments — you reach for a trap app (defection), or an agent blocks while you work
          (interruption) — and answers both the same way: what you said you wanted, one tap away, or batched as an open loop for
          your review moment. Replacement, never restriction.
        </p>
      </header>
      <OnboardingCard />
      <DemoBanner />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <LiveModeDock />
          <OfferCard />
          <QuestionCard />
        </div>
        <div className="space-y-4 lg:col-span-2">
          <OpenLoopsPanel />
          <HeldPanel />
        </div>
      </div>
      <TodayPanel />
      <SourcesPanel />
      <ActivityLog />
    </div>
  );
}
