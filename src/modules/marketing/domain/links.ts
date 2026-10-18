import type { Attribution, ChannelKey } from "@/shared/domain/channels";

/** Короткая рекламная ссылка: ведёт на сайт с UTM-метками или в WhatsApp с кодом ссылки. */
export interface TrackedLink {
  id: string;
  slug: string;
  kind: "site" | "whatsapp";
  targetPath: string;
  waText: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  archived: boolean;
}

/** Готовые источники для генератора ссылок: utm_source и utm_medium. */
export const sourcePresets: { key: ChannelKey; label: string; source: string; medium: string }[] = [
  { key: "instagram", label: "Instagram", source: "instagram", medium: "social" },
  { key: "tiktok", label: "TikTok", source: "tiktok", medium: "social" },
  { key: "whatsapp", label: "WhatsApp", source: "whatsapp", medium: "messenger" },
  { key: "telegram", label: "Telegram", source: "telegram", medium: "messenger" },
  { key: "bloggers", label: "Блогер", source: "blogger", medium: "influencer" },
  { key: "google_ads", label: "Google Ads", source: "google", medium: "cpc" },
  { key: "yandex_ads", label: "Яндекс Директ", source: "yandex", medium: "cpc" },
  { key: "facebook", label: "Facebook", source: "facebook", medium: "social" },
  { key: "email", label: "Рассылка", source: "newsletter", medium: "email" },
  { key: "offline", label: "Листовка / QR", source: "offline", medium: "qr" },
];

export const isValidSlug = (slug: string) => /^[a-z0-9-]{1,40}$/i.test(slug);

export function linkAttribution(l: Pick<TrackedLink, "slug" | "utmSource" | "utmMedium" | "utmCampaign" | "utmContent">): Attribution {
  return {
    source: l.utmSource,
    ...(l.utmMedium ? { medium: l.utmMedium } : {}),
    ...(l.utmCampaign ? { campaign: l.utmCampaign } : {}),
    ...(l.utmContent ? { content: l.utmContent } : {}),
    link: l.slug,
  };
}

/** Полная ссылка с UTM для сайта. */
export function buildSiteUrl(base: string, path: string, a: { source: string; medium?: string; campaign?: string; content?: string }, link?: string) {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, base);
  url.searchParams.set("utm_source", a.source);
  if (a.medium) url.searchParams.set("utm_medium", a.medium);
  if (a.campaign) url.searchParams.set("utm_campaign", a.campaign);
  if (a.content) url.searchParams.set("utm_content", a.content);
  if (link) url.searchParams.set("lnk", link);
  return url.toString();
}

/** Куда на самом деле ведёт ссылка. */
export function linkTarget(l: TrackedLink, appUrl: string, whatsappNumber: string) {
  if (l.kind === "whatsapp") {
    return whatsappLink(whatsappNumber, l.waText.trim() || "Здравствуйте! Хочу заказать книгу", l.slug);
  }
  return buildSiteUrl(appUrl, l.targetPath, { source: l.utmSource, medium: l.utmMedium, campaign: l.utmCampaign, content: l.utmContent }, l.slug);
}

/** Ссылка в WhatsApp с первым сообщением и кодом ссылки в нём — по коду CRM узнаёт источник заявки (linkCodeFromText). */
export function whatsappLink(whatsappNumber: string, text: string, code: string) {
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`${text} (код: ${code})`)}`;
}

/** Код ссылки в первом сообщении WhatsApp: «… (код: insta-bio)» или «#insta-bio». */
export function linkCodeFromText(text: string): string | null {
  const m = /\(\s*код:?\s*([a-z0-9][a-z0-9-]{1,40})\s*\)|(?:^|\s)#([a-z0-9][a-z0-9-]{1,40})(?=\s|$)/i.exec(text);
  return (m?.[1] ?? m?.[2])?.toLowerCase() ?? null;
}

/** Роботы превью ссылок (мессенджеры, соцсети) не должны накручивать переходы. */
export const isPreviewBot = (userAgent: string) => /bot|crawler|spider|preview|facebookexternalhit|WhatsApp|TelegramBot|Slackbot|vkShare/i.test(userAgent);
