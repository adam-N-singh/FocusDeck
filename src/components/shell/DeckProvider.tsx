"use client";

import { useEffect, type ReactNode } from "react";
import { pollBridge, pushBridgeConfig } from "@/lib/client/bridgeClient";
import { advanceDemo } from "@/lib/client/demo";
import { electLeader } from "@/lib/client/leader";
import { contextFor, store } from "@/lib/client/store";

const TICK_MS = 15_000;
const POLL_MS = 2_000;
const DEMO_FRAME_MS = 250;

/**
 * Runs the core loop for the whole app. It lives in the root layout, not a
 * page, because Next.js hides pages on navigation and pauses their effects —
 * the clock, the sensor bridge and a running demo must keep going while you
 * are on another screen.
 */
export function DeckProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    let timers: number[] = [];
    const stopEngine = () => {
      timers.forEach((id) => window.clearInterval(id));
      timers = [];
    };
    const startEngine = () => {
      stopEngine();
      store.tick();
      timers.push(window.setInterval(() => store.tick(), TICK_MS));
      timers.push(window.setInterval(() => void pollBridge(), POLL_MS));
      timers.push(window.setInterval(() => {
        const { demo, model, history } = store.getSnapshot();
        if (demo?.playing) store.updateDemo((d) => advanceDemo(d, DEMO_FRAME_MS / 1000, contextFor(model, history)));
      }, DEMO_FRAME_MS));
      void pushBridgeConfig().then(() => pollBridge());
    };

    const stopElection = electLeader((leader) => {
      if (!leader) store.flush();
      store.hydrate(leader);
      if (leader) startEngine();
      else stopEngine();
    });

    // Followers mirror what the leading tab writes; they never write themselves.
    const onStorage = (event: StorageEvent) => {
      if (!store.getSnapshot().leader && event.key?.startsWith("focusdeck:")) store.hydrate(false);
    };
    const flush = () => store.flush();
    window.addEventListener("storage", onStorage);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);

    // Keep the bridge's designated-app filter in step with your model — including after
    // the bridge is switched back on, since changes made while it was off weren't sent.
    let designated = "";
    const unsubscribe = store.subscribe(() => {
      const { leader, hydrated, model, bridge } = store.getSnapshot();
      const key = `${bridge.enabled}|${model.designatedApps.join(",")}`;
      if (leader && hydrated && key !== designated) {
        designated = key;
        void pushBridgeConfig();
      }
    });

    return () => {
      stopElection();
      stopEngine();
      unsubscribe();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, []);

  return <>{children}</>;
}
