import type { Metadata } from "next";
import "@/app/globals.css";
import { Providers } from "@/app/providers";
import { AppShell } from "@/components/features/app-shell";
import type { CSSProperties, ReactNode } from "react";

export const metadata: Metadata = {
  title: "Fall River Alert",
  description: "Community incident intelligence with real-time map + verification"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="antialiased"
        style={
          {
            "--font-heading": "\"Space Grotesk\", \"Avenir Next\", \"Segoe UI\", sans-serif",
            "--font-body": "\"Source Sans 3\", \"Inter\", \"Segoe UI\", sans-serif",
            fontFamily: "var(--font-body)",
            backgroundColor: "var(--bg)",
            color: "var(--fg)"
          } as CSSProperties
        }
      >
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
