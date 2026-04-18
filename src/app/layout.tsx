import type { Metadata } from "next";
import { Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TopRail } from "@/components/layout/TopRail";
import { Nav } from "@/components/layout/Nav";
import { Footer } from "@/components/layout/Footer";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "La Costa Gourmet — Café supplies since 2003",
    template: "%s · La Costa Gourmet",
  },
  description:
    "Bulk chai, cocoa, syrups, frappé mixes and café supplies for independent coffee shops, kitchens, and home. Family-run since 2003.",
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
