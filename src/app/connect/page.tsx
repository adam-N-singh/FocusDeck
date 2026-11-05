import type { Metadata } from "next";
import { ConnectView } from "@/components/connect/ConnectView";
import { ProvidersPanel } from "@/components/connect/ProvidersPanel";
import { PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Connect" };

/**
 * Connect: whether FocusDeck is listening, the connector marketplace (what it
 * may notice, app by app), and the AI behind the AI helper (your own keys,
 * local models, or the subscriptions you already pay for, through their
 * official CLIs).
 */
export default function ConnectPage() {
  return (
    <div className="space-y-12">
      <PageHeader
        title="Connect"
        description="Connectors tell FocusDeck when something happens in an app you chose: an agent blocks on you, a build finishes, you open X. Each one sends a few metadata fields, and nothing else."
      />
      <ConnectView />
      <div className="border-t border-line pt-12">
        <ProvidersPanel />
      </div>
    </div>
  );
}
