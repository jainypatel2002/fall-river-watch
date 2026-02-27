import type { Metadata } from "next";
import { Space_Grotesk, Source_Sans_3 } from "next/font/google";
import "@/app/globals.css";
import { Providers } from "@/app/providers";
import { AppShell } from "@/components/features/app-shell";
import type { ReactNode } from "react";

const headingFont = Space_Grotesk({ subsets: ["latin"], variable: "--font-heading" });
const bodyFont = Source_Sans_3({ subsets: ["latin"], variable: "--font-body" });

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
        className={`${headingFont.variable} ${bodyFont.variable} antialiased`}
        style={{ fontFamily: "var(--font-body)", backgroundColor: "var(--bg)", color: "var(--fg)" }}
      >
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
