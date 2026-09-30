import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { crmLinkClicks, crmLinks, type CrmLink } from "../db/schema";
import { env } from "../env";
import { site } from "@/config/site";
import { buildSiteUrl, type Attribution } from "./channels";
import { getSetting } from "./settings";

export function linkAttribution(l: Pick<CrmLink, "slug" | "utmSource" | "utmMedium" | "utmCampaign" | "utmContent">): Attribution {
  return {
    source: l.utmSource,
    ...(l.utmMedium ? { medium: l.utmMedium } : {}),
    ...(l.utmCampaign ? { campaign: l.utmCampaign } : {}),
    ...(l.utmContent ? { content: l.utmContent } : {}),
    link: l.slug,
  };
}

/** Номер WhatsApp магазина для ссылок «написать в WhatsApp»: из настроек или контактов сайта. */
export async function shopWhatsapp() {
  const fromSettings = (await getSetting("crm.whatsappNumber")).replace(/\D/g, "");
  return fromSettings || site.contacts.whatsapp.replace(/\D/g, "");
}

/** Куда на самом деле ведёт ссылка. */
export async function linkTarget(l: CrmLink) {
  if (l.kind === "whatsapp") {
    const text = `${l.waText.trim() || "Здравствуйте! Хочу заказать книгу"} (код: ${l.slug})`;
    return `https://wa.me/${await shopWhatsapp()}?text=${encodeURIComponent(text)}`;
  }
  return buildSiteUrl(env.appUrl, l.targetPath, { source: l.utmSource, medium: l.utmMedium, campaign: l.utmCampaign, content: l.utmContent }, l.slug);
}

export const shortUrl = (slug: string) => `${env.appUrl}/go/${slug}`;

export async function findLink(slug: string) {
  return (await db.query.crmLinks.findFirst({ where: eq(crmLinks.slug, slug.toLowerCase()) })) ?? null;
}

const almatyDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "Asia/Almaty" }).format(new Date());

export async function recordClick(linkId: string) {
  await db.update(crmLinks).set({ clicks: sql`${crmLinks.clicks} + 1` }).where(eq(crmLinks.id, linkId));
  await db
    .insert(crmLinkClicks)
    .values({ linkId, day: almatyDay(), clicks: 1 })
    .onConflictDoUpdate({ target: [crmLinkClicks.linkId, crmLinkClicks.day], set: { clicks: sql`${crmLinkClicks.clicks} + 1` } });
}
