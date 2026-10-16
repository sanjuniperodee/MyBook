import "server-only";
import { randomBytes } from "node:crypto";
import { site } from "@/config/site";
import { env } from "@/config/env";
import { formatDate } from "@/lib/dates";
import type { SettingsReader } from "@/shared/application";
import { appLink } from "@/shared/infrastructure/mail";
import type { AppLinks, MarketingSettings } from "../application";

/** Настройки CRM, которые читает маркетинг: предел скидки из чата и номер WhatsApp для рекламных ссылок. */
export type MarketingSettingKey = "crm.maxDiscount" | "crm.whatsappNumber";

export const crmMarketingSettings = (settings: SettingsReader<MarketingSettingKey>): MarketingSettings => ({
  maxDiscount: async () => Number(await settings.get("crm.maxDiscount")) || 0,
  /** Номер WhatsApp магазина: из настроек CRM или контактов сайта. */
  async whatsappNumber() {
    const fromSettings = (await settings.get("crm.whatsappNumber")).replace(/\D/g, "");
    return fromSettings || site.contacts.whatsapp.replace(/\D/g, "");
  },
});

export const personalPromoCode = () => `MB-${randomBytes(4).toString("hex").toUpperCase().slice(0, 6)}`;

export const siteLinks: AppLinks = {
  get appUrl() {
    return env.appUrl;
  },
  link: (path, locale) => appLink(path, locale),
  formatDate: (d, locale) => formatDate(d, true, locale),
};
