import type { Metadata, Viewport } from "next";
import { fontVariables } from "./fonts";
import { site } from "@/config/site";
import { env } from "@/config/env";
import "./globals.css";
import { Suspense } from "react";
import { Analytics } from "@/components/analytics/Analytics";
import { Overlays } from "@/components/ui/overlays";
import { I18nProvider } from "@/i18n/client";
import { getLocale } from "@/i18n/server";
import { messagesFor } from "@/i18n/messages";
import { localeMeta } from "@/i18n/config";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const m = messagesFor(locale).common.meta;
  return {
    metadataBase: new URL(env.appUrl),
    title: { default: `${site.name} — ${m.tagline}`, template: `%s · ${site.name}` },
    description: m.description,
    applicationName: site.name,
    category: "shopping",
    formatDetection: { telephone: false, email: false, address: false },
    // Подтверждение прав в Google Search Console и Яндекс Вебмастере (значения — из .env)
    verification: { google: process.env.GOOGLE_SITE_VERIFICATION || undefined, yandex: process.env.YANDEX_VERIFICATION || undefined },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
    openGraph: {
      type: "website",
      locale: localeMeta[locale].og,
      alternateLocale: locale === "ru" ? localeMeta.kk.og : localeMeta.ru.og,
      siteName: site.name,
      title: `${site.name} — ${m.tagline}`,
      description: m.description,
      images: [{ url: `/api/og?l=${locale}`, width: 1200, height: 630, alt: `${site.name} — ${m.tagline}` }],
    },
    twitter: { card: "summary_large_image", images: [`/api/og?l=${locale}`] },
  };
}

export const viewport: Viewport = {
  themeColor: "#faf7f2",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={fontVariables} data-scroll-behavior="smooth">
      <body className="min-h-dvh">
        <I18nProvider locale={locale}>
          {children}
          <Overlays />
        </I18nProvider>
        <Suspense fallback={null}>
          <Analytics ids={{ ym: process.env.YANDEX_METRIKA_ID, ga: process.env.GA_MEASUREMENT_ID, pixel: process.env.META_PIXEL_ID }} />
        </Suspense>
      </body>
    </html>
  );
}
