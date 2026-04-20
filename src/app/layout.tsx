import type { Metadata } from "next";
import { Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TopRail } from "@/components/layout/TopRail";
import { Nav } from "@/components/layout/Nav";
import { Footer } from "@/components/layout/Footer";

// Fraunces — drop 600 (unused) and pin to actually-used weights.
// 300 stays because HomeHero uses it; 400 + 500 cover the rest.
// Italic stays — used in 60+ places across the site.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
  preload: true,
  fallback: ["Georgia", "Cambria", "Times New Roman", "serif"],
  // adjustFontFallback defaults to true on Google fonts → metric-aware
  // override font is generated automatically.
});

// JetBrains Mono — drop 300 (no explicit usage). 400 default + 500 medium.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
  preload: false, // mono is below-the-fold filler; let it load when needed
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "monospace"],
});

export const metadata: Metadata = {
  title: {
    default: "La Costa Gourmet — Café-quality drinks shipped to your door",
    template: "%s · La Costa Gourmet",
  },
  description:
    "Café-quality chai, cocoa, frappés, and smoothie bases — shipped nationwide from California. Bulk-bag recipes trusted by coffee shops since 2003.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001",
  ),
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-paper text-ink-2 font-display antialiased min-h-screen flex flex-col">
        <TopRail />
        <Nav />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
