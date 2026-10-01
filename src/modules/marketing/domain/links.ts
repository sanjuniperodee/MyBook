import { buildSiteUrl, type Attribution } from "@/modules/marketing/domain/channels";

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

/** Куда на самом деле ведёт ссылка. */
export function linkTarget(l: TrackedLink, appUrl: string, whatsappNumber: string) {
  if (l.kind === "whatsapp") {
    const text = `${l.waText.trim() || "Здравствуйте! Хочу заказать книгу"} (код: ${l.slug})`;
    return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`;
  }
  return buildSiteUrl(appUrl, l.targetPath, { source: l.utmSource, medium: l.utmMedium, campaign: l.utmCampaign, content: l.utmContent }, l.slug);
}

/** Роботы превью ссылок (мессенджеры, соцсети) не должны накручивать переходы. */
export const isPreviewBot = (userAgent: string) => /bot|crawler|spider|preview|facebookexternalhit|WhatsApp|TelegramBot|Slackbot|vkShare/i.test(userAgent);
