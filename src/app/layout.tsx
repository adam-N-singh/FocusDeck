import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import { DeckProvider } from "@/components/shell/DeckProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FocusDeck — mode-aware focus for agent-heavy work",
  description:
    "Hymah's attention engine in the agent-heavy desktop world: modes, open loops batched to a review moment, offers in your own words, and an honest weekly mirror.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <DeckProvider>
          <AppShell>{children}</AppShell>
        </DeckProvider>
      </body>
    </html>
  );
}
