import type { Metadata } from "next";
import { MirrorView } from "@/components/mirror/MirrorView";
import { PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Your week" };

/** Show — the weekly honest mirror (PRODUCT.md, core loop step 6). */
export default function MirrorPage() {
  return (
    <div className="space-y-10">
      <PageHeader title="Your week" description="A look back, once a week: which way things are going, how long your agents waited on you, and what slipped. Private, and never a score." />
      <MirrorView />
    </div>
  );
}
