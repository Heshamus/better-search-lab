import "./globals.css";
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { StaleBuildReloader } from "@/components/stale-build-reloader";
import { DemoProvider } from "@/components/demo-provider";
import { DemoBanner } from "@/components/demo-banner";
import { isDemoMode } from "@/lib/demo/mode";

export const metadata: Metadata = {
  title: "Better Search Lab",
  description: "Search & GEO visibility — your rankings, AI-visibility, and content command center.",
};

// The App Router's true root layout. Loads Geist (UI) + Geist Mono (data/numerals)
// as the --font-geist-sans / --font-geist-mono CSS variables the design system in
// globals.css maps to --font-sans / --font-mono. Bundled locally via the `geist`
// package, so the Docker build never fetches fonts over the network.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
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
