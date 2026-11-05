import type { Metadata } from "next";
import { Recursive } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import { DeckProvider } from "@/components/shell/DeckProvider";
import "./globals.css";

// One family, three voices: Linear for the interface, Casual for your own
// words, Mono for code. CASL and MONO are the axes that switch between them.
const recursive = Recursive({
  variable: "--font-recursive",
  subsets: ["latin"],
  axes: ["CASL", "MONO"],
});

export const metadata: Metadata = {
  title: { default: "Now — FocusDeck", template: "%s — FocusDeck" },
  description:
    "A focus companion for agent-heavy work: modes you choose, agents batched to a review moment, offers in your own words, and an honest weekly look back.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${recursive.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <DeckProvider>
          <AppShell>{children}</AppShell>
        </DeckProvider>
      </body>
    </html>
  );
}
