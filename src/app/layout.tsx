import type { Metadata } from "next";
import "./globals.css";
import { TopRail } from "@/components/layout/TopRail";
import { Nav } from "@/components/layout/Nav";
import { Footer } from "@/components/layout/Footer";
import { StorefrontChrome } from "@/components/layout/StorefrontChrome";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";

export const metadata: Metadata = {
  title: {
    default: "La Costa Gourmet — Café-quality drinks shipped to your door",
    template: "%s · La Costa Gourmet",
  },
  description:
    "Café-quality chai, smoothies, oatmeal, specialty beverages, and more — shipped nationwide from La Costa Gourmet. Premium brands trusted by independent coffee shops since 2003.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001",
  ),
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-paper text-ink-2 font-display antialiased min-h-screen flex flex-col">
        <a className="skip-link" href="#main-content">Skip to content</a><GoogleAnalytics />
        <StorefrontChrome>
          <Nav />
          <TopRail />
        </StorefrontChrome>
        <div id="main-content" className="flex-1" tabIndex={-1}>{children}</div>
        <StorefrontChrome>
          <Footer />
        </StorefrontChrome>
      </body>
    </html>
  );
}
