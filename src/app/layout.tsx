import "./globals.css";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

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
      <body>{children}</body>
    </html>
  );
}
