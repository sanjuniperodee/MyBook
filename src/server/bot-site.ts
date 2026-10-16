import "server-only";
import { env } from "@/config/env";
import { getAddons, getDeliveryOptions, getPlans, productionDays, registrationOpen } from "@/config/site";
import { landings } from "@/lib/content/landings";
import { isThemeId } from "@/lib/content/themes";
import type { BotSiteInfo } from "@/modules/messaging";
import { ensureCatalog } from "./catalog";

/**
 * Темы, которые бот может предложить в «для кого». autobiography и blank (docs/features/book-modes.md) появятся в
 * списке сами, когда сайт начнёт их понимать (isThemeId), — до этого бот их не предлагает.
 */
const BOT_THEMES = ["love", "mom", "dad", "friend", "autobiography", "blank"];

/** Что бот берёт с сайта: действующие цены и сроки («Цены и тарифы»), адрес, регистрация, темы, посадочные страницы. */
export const botSiteInfo: BotSiteInfo = {
  async catalog() {
    await ensureCatalog();
    return {
      plans: getPlans().map((p) => ({ id: p.id, price: p.price, extraCopyPrice: p.extraCopyPrice, hidden: p.hidden })),
      delivery: getDeliveryOptions().map((d) => ({ id: d.id, price: d.price })),
      addons: getAddons().map((a) => ({ id: a.id, price: a.price })),
      productionDays,
    };
  },
  async site() {
    await ensureCatalog();
    return { url: env.appUrl, registrationOpen: registrationOpen(), themes: BOT_THEMES.filter((t) => isThemeId(t)), landings: landings.map((l) => l.slug) };
  },
};
