import type { Metadata, Viewport } from "next";
import { fontVariables } from "./fonts";
import { site } from "@/config/site";
import { env } from "@/lib/env";
import "./globals.css";
import { Suspense } from "react";
import { Analytics } from "@/components/analytics/Analytics";
import { Overlays } from "@/components/ui/overlays";

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: { default: `${site.name} — ${site.tagline}`, template: `%s · ${site.name}` },
  description: site.description,
  applicationName: site.name,
  openGraph: {
    type: "website",
    locale: site.locale,
    siteName: site.name,
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#faf7f2",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={fontVariables} data-scroll-behavior="smooth">
      <body className="min-h-dvh">
        {children}
        <Overlays />
        <Suspense fallback={null}>
          <Analytics ids={{ ym: process.env.YANDEX_METRIKA_ID, ga: process.env.GA_MEASUREMENT_ID, pixel: process.env.META_PIXEL_ID }} />
        </Suspense>
      </body>
    </html>
  );
}
