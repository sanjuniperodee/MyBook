/**
 * SEO-хелперы: абсолютные адреса и разметка schema.org (JSON-LD).
 * Модуль без обращений к базе — им пользуются страницы, sitemap и тесты.
 */
import { env } from "@/config/env";
import { plans, site } from "@/config/site";
import { localeMeta, localizePath, type Locale } from "@/i18n/config";

type Json = Record<string, unknown>;

/** Полный адрес страницы на нужном языке: ("/gift", "kk") → https://домен/kk/gift. Главная — без слеша в конце. */
export function absoluteUrl(path: string, locale: Locale = "ru"): string {
  const local = localizePath(path, locale);
  return `${env.appUrl}${local === "/" ? "" : local}`;
}

/** Картинка для соцсетей и разметки: общая или своя для посадочной страницы/статьи. */
export function ogImage(locale: Locale, key?: string): string {
  return `/api/og?l=${locale}${key ? `&s=${encodeURIComponent(key)}` : ""}`;
}

const imageSize = { width: 1200, height: 630 } as const;

/** Open Graph + Twitter для страницы: адрес, заголовок, описание и картинка согласованы между собой. */
export function socialMeta(opts: { path: string; locale: Locale; title: string; description: string; key?: string; type?: "website" | "article"; publishedTime?: string; modifiedTime?: string }) {
  const image = ogImage(opts.locale, opts.key);
  return {
    openGraph: {
      type: opts.type ?? "website",
      url: absoluteUrl(opts.path, opts.locale),
      siteName: site.name,
      locale: localeMeta[opts.locale].og,
      title: opts.title,
      description: opts.description,
      images: [{ url: image, ...imageSize, alt: opts.title }],
      ...(opts.type === "article" ? { publishedTime: opts.publishedTime, modifiedTime: opts.modifiedTime ?? opts.publishedTime } : {}),
    },
    twitter: { card: "summary_large_image" as const, title: opts.title, description: opts.description, images: [image] },
  };
}

const ORG_ID = `${env.appUrl}/#organization`;
const SITE_ID = `${env.appUrl}/#website`;

/** Организация: бренд, логотип, контакты и профили в соцсетях. */
export function organizationLd(description: string): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: site.name,
    url: env.appUrl,
    logo: { "@type": "ImageObject", url: `${env.appUrl}/logo.png`, width: 438, height: 312 },
    description,
    email: site.contacts.email,
    telephone: site.contacts.phone,
    areaServed: { "@type": "Country", name: "KZ" },
    contactPoint: [{ "@type": "ContactPoint", contactType: "customer support", email: site.contacts.email, telephone: site.contacts.phone, availableLanguage: ["ru", "kk"] }],
    sameAs: [site.contacts.instagram, site.contacts.telegram],
  };
}

/** Сайт: название и языки — помогает поисковикам показывать название бренда в выдаче. */
export function websiteLd(locale: Locale): Json {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": SITE_ID,
    name: site.name,
    url: env.appUrl,
    inLanguage: localeMeta[locale].intl,
    publisher: { "@id": ORG_ID },
  };
}

/** Хлебные крошки: последний пункт — сама страница. */
export function breadcrumbLd(items: { name: string; path: string }[], locale: Locale): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absoluteUrl(it.path, locale) })),
  };
}

export function faqLd(items: [string, string][]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
}

/** По одному предложению на каждый тариф: цена, валюта, наличие. */
export function planOffers(names: Record<string, string>, url: string): Json[] {
  return plans.map((p) => ({
    "@type": "Offer",
    name: names[p.id] ?? p.id,
    price: p.price,
    priceCurrency: site.currency,
    availability: "https://schema.org/InStock",
    itemCondition: "https://schema.org/NewCondition",
    url,
  }));
}

export interface ReviewLdInput {
  summary: { average: number; count: number } | null;
  reviews: { authorName: string; text: string; rating: number; publishedAt: Date | null }[];
}

/** Звёзды в выдаче — только по настоящим отзывам и когда их достаточно. */
export function reviewsLd({ summary, reviews }: ReviewLdInput): Json {
  if (!summary || !reviews.length) return {};
  return {
    aggregateRating: { "@type": "AggregateRating", ratingValue: summary.average, reviewCount: summary.count, bestRating: 5, worstRating: 1 },
    review: reviews.map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.authorName },
      ...(r.publishedAt ? { datePublished: r.publishedAt.toISOString().slice(0, 10) } : {}),
      reviewBody: r.text,
      reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
    })),
  };
}

export function productLd(opts: { name: string; description: string; url: string; image: string; locale: Locale; planNames: Record<string, string>; reviews?: ReviewLdInput }): Json {
  const prices = plans.map((p) => p.price);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: opts.name,
    description: opts.description,
    image: `${env.appUrl}${opts.image}`,
    url: opts.url,
    inLanguage: localeMeta[opts.locale].intl,
    brand: { "@type": "Brand", name: site.name },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: site.currency,
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      offerCount: plans.length,
      availability: "https://schema.org/InStock",
      url: opts.url,
      offers: planOffers(opts.planNames, opts.url),
    },
    ...(opts.reviews ? reviewsLd(opts.reviews) : {}),
  };
}

export function articleLd(opts: { title: string; description: string; url: string; image: string; locale: Locale; published: string; modified?: string }): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: opts.title,
    description: opts.description,
    image: `${env.appUrl}${opts.image}`,
    mainEntityOfPage: opts.url,
    inLanguage: localeMeta[opts.locale].intl,
    datePublished: opts.published,
    dateModified: opts.modified ?? opts.published,
    author: { "@type": "Organization", name: site.name, url: env.appUrl },
    publisher: { "@type": "Organization", name: site.name, url: env.appUrl, logo: { "@type": "ImageObject", url: `${env.appUrl}/logo.png` } },
  };
}
