import type { Metadata } from "next";
import { DeclareView } from "@/components/declare/DeclareView";
import { PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Setup" };

/**
 * Setup (the Declare step of the core loop): which apps FocusDeck may notice,
 * your distractions, your modes, your if-then plans and what you'd rather do,
 * in your own words. Everything FocusDeck offers traces back to this page.
 */
export default function DeclarePage() {
  return (
    <>
      <PageHeader
        title="Setup"
        description="How you work, in your own words. Everything FocusDeck offers comes from this page, and every change saves as you make it."
      />
      <DeclareView />
    </>
  );
}
