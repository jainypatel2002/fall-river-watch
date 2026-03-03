import type { Metadata, Viewport } from "next";
import "@/app/globals.css";
import { Providers } from "@/app/providers";
import { AppShell } from "@/components/features/app-shell";
import type { CSSProperties, ReactNode } from "react";

export const metadata: Metadata = {
  title: "Fall River Alert",
  description: "Community incident intelligence with real-time map + verification",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Fall River Alert"
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/icons/icon-192.png"]
  }
};

export const viewport: Viewport = {
  themeColor: "#07090f"
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
