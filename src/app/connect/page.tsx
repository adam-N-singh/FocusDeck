import type { Metadata } from "next";
import { ConnectView } from "@/components/connect/ConnectView";
import { ProvidersPanel } from "@/components/connect/ProvidersPanel";

export const metadata: Metadata = { title: "Connect — FocusDeck" };

/**
 * Connect: the connector marketplace (what FocusDeck may notice, app by app)
 * and the AI behind System Two (your own keys, local models, or the
 * subscriptions you already pay for, through their official CLIs).
 */
export default function ConnectPage() {
  return (
    <div className="space-y-6">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold tracking-widest text-emerald-400">YOUR APPS AND YOUR AI</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">Connect</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Connectors tell FocusDeck when something happens in the apps it watches for you: an agent blocked on you, a build
          finishing, a reach for X. Each one is open, sends a handful of metadata fields, and is checked by the bridge on arrival.
          Below them, choose which AI does System Two’s occasional thinking.
        </p>
      </header>
      <ConnectView />
      <ProvidersPanel />
    </div>
  );
}
