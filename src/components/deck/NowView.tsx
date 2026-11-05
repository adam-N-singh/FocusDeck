"use client";

import { useDeck } from "@/lib/client/hooks";
import { Skeleton } from "@/components/ui/primitives";
import { ActivityLog } from "./ActivityLog";
import { DemoBanner } from "./DemoBanner";
import { ModeHero } from "./ModeHero";
import { Moment, QuestionCard, ReadyCard } from "./Moment";
import { TodayStrip } from "./Today";
import { TryIt } from "./TryIt";
import { HeldList, WaitingList } from "./Waiting";
import { SetupNudge, Welcome } from "./Welcome";

/**
 * Now: where you are, the one thing that wants you (if anything), who is
 * waiting, and today in four numbers. Everything else is one click down.
 * Built to work in a narrow window beside your editor.
 */
export function NowView() {
  const { state } = useDeck();
  if (!state.hydrated) {
    return (
      <div className="max-w-xl space-y-6 pt-2">
        <div className="h-14 w-64 animate-pulse rounded-xl bg-line/70" />
        <Skeleton lines={4} />
      </div>
    );
  }
  if (!state.onboarded) return <Welcome />;

  return (
    <div className="space-y-12">
      <DemoBanner />
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-16">
        <div className="space-y-6">
          <ModeHero />
          <div className="space-y-4 pt-4">
            <Moment />
            <QuestionCard />
            <ReadyCard />
          </div>
        </div>
        <aside className="space-y-8 lg:pt-3" aria-label="Waiting and held">
          <WaitingList />
          <HeldList />
          <SetupNudge />
        </aside>
      </div>
      <TodayStrip />
      <div className="space-y-1 border-t border-line pt-5">
        <ActivityLog />
        <TryIt />
      </div>
    </div>
  );
}
