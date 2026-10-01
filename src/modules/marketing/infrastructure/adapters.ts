import "server-only";
import { randomBytes } from "node:crypto";
import { site } from "@/config/site";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/utils";
import { getSetting } from "@/lib/crm/settings";
import { appLink } from "@/shared/infrastructure/mail";
import type { AppLinks, MarketingSettings } from "../application";

export const crmMarketingSettings: MarketingSettings = {
  maxDiscount: async () => Number(await getSetting("crm.maxDiscount")) || 0,
  /** Номер WhatsApp магазина: из настроек CRM или контактов сайта. */
  async whatsappNumber() {
    const fromSettings = (await getSetting("crm.whatsappNumber")).replace(/\D/g, "");
    return fromSettings || site.contacts.whatsapp.replace(/\D/g, "");
  },
};

export const personalPromoCode = () => `MB-${randomBytes(4).toString("hex").toUpperCase().slice(0, 6)}`;

export const siteLinks: AppLinks = {
  get appUrl() {
    return env.appUrl;
  },
  link: (path, locale) => appLink(path, locale),
  formatDate: (d, locale) => formatDate(d, true, locale),
};
