import type { Metadata } from "next";
import { SeesView } from "@/components/sees/SeesView";
import { PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Privacy" };

/**
 * Privacy — what FocusDeck notices, what it never sees, where it keeps it,
 * and the controls to take it or erase it (ASSESSMENT.md §6, Stage 0 spike (c)).
 */
export default function SeesPage() {
  return (
    <div className="space-y-12">
      <PageHeader
        title="Privacy"
        description="FocusDeck draws the line in how it’s built, not in a promise: only apps you choose, only metadata, filtered before it’s sent, and kept in this browser. This page shows all of it."
      />
      <SeesView />
    </div>
  );
}
