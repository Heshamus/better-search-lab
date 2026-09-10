import "./globals.css";
import "@fontsource-variable/hanken-grotesk";
import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { StaleBuildReloader } from "@/components/stale-build-reloader";
import { DemoProvider } from "@/components/demo-provider";
import { DemoBanner } from "@/components/demo-banner";
import { isDemoMode } from "@/lib/demo/mode";

export const metadata: Metadata = {
  title: "Better Search Lab",
  description: "Search & GEO visibility — your rankings, AI-visibility, and content command center.",
};

// The App Router's true root layout. Hanken Grotesk (UI) is bundled locally via
// Fontsource (`@fontsource-variable/hanken-grotesk`, imported as a CSS side effect
// above) and Geist Mono (code/numerals) via the `geist` package's --font-geist-mono
// CSS variable, which the design system in globals.css maps to --font-mono while
// --font-sans resolves to Hanken directly from @theme. Both are local, so the
// Docker build never fetches fonts over the network.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={GeistMono.variable}>
      <body>
        <DemoProvider demo={isDemoMode()}>
          <DemoBanner />
          <StaleBuildReloader />
          {children}
        </DemoProvider>
      </body>
    </html>
  );
}
