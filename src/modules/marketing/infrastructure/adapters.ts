import "server-only";
import { randomBytes } from "node:crypto";
import { site } from "@/config/site";
import { env } from "@/config/env";
import { formatDate } from "@/lib/dates";
import type { SettingsReader } from "@/shared/application";
import { appLink } from "@/shared/infrastructure/mail";
import { normalizePhone } from "@/shared/domain/phone";
import type { AppLinks, MarketingSettings } from "../application";

/** Настройки CRM, которые читает маркетинг: предел скидки из чата и номер WhatsApp для рекламных ссылок. */
export type MarketingSettingKey = "crm.maxDiscount" | "crm.whatsappNumber";

export const crmMarketingSettings = (settings: SettingsReader<MarketingSettingKey>): MarketingSettings => ({
  maxDiscount: async () => Number(await settings.get("crm.maxDiscount")) || 0,
  /** Номер WhatsApp магазина: из настроек CRM или контактов сайта; «8 701…», сохранённый раньше, — как 77011234567 (wa.me). */
  async whatsappNumber() {
    const fromSettings = normalizePhone(await settings.get("crm.whatsappNumber"));
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
