import type { Metadata } from "next";
import { Space_Grotesk, Source_Sans_3 } from "next/font/google";
import "@/app/globals.css";
import { Providers } from "@/app/providers";
import type { ReactNode } from "react";

const headingFont = Space_Grotesk({ subsets: ["latin"], variable: "--font-heading" });
const bodyFont = Source_Sans_3({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Neighborhood Incident Map",
  description: "Citizen-lite incident mapping with verification and realtime updates"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${headingFont.variable} ${bodyFont.variable} antialiased`} style={{ fontFamily: "var(--font-body)" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
