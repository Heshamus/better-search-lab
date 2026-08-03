import "./globals.css";

// The App Router's true root layout. Required as of this task, which adds
// the first real page (`(auth)/login/page.tsx`) — without a root layout
// rendering <html>/<body>, Next.js fails the build once any page exists.
// The `(app)/layout.tsx` route-group layout stays a separate, nested layout
// (dashboard chrome, filled in by Task 12) that renders inside this one.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
