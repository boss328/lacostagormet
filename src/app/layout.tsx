import type { Metadata } from "next";
import "./globals.css";
import { TopRail } from "@/components/layout/TopRail";
import { Nav } from "@/components/layout/Nav";
import { Footer } from "@/components/layout/Footer";
import { StorefrontChrome } from "@/components/layout/StorefrontChrome";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { HOME_DESCRIPTION, HOME_TITLE } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: {
    default: HOME_TITLE,
    template: "%s · La Costa Gourmet",
  },
  description: HOME_DESCRIPTION,
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.lacostagourmet.com",
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
