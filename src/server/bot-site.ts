import "server-only";
import { env } from "@/config/env";
import { getAddons, getDeliveryOptions, getPlans, productionDays, registrationOpen } from "@/config/site";
import { landings } from "@/lib/content/landings";
import { isThemeId } from "@/lib/content/themes";
import type { BotSiteInfo } from "@/modules/messaging";
import { ensureCatalog } from "./catalog";

/**
 * Виды книг, которые бот предлагает в «для кого» (lib/content/kinds.ts): подарки по темам, «Автобиография»
 * (autobiography) и «Вручную — своя книга» (blank). Тема, которой сайт не знает (isThemeId), не предлагается.
 */
const BOT_THEMES = ["love", "mom", "dad", "grandma", "child", "sibling", "friend", "teacher", "autobiography", "blank"];

/** Что бот берёт с сайта: действующие цены и сроки («Цены и тарифы»), адрес, регистрация, темы, посадочные страницы. */
export const botSiteInfo: BotSiteInfo = {
  async catalog() {
    await ensureCatalog();
    return {
      plans: getPlans().map((p) => ({ id: p.id, price: p.price, extraCopyPrice: p.extraCopyPrice, hidden: p.hidden })),
      delivery: getDeliveryOptions().map((d) => ({ id: d.id, price: d.price, quoted: d.quoted })),
      addons: getAddons().filter((a) => !a.hidden).map((a) => ({ id: a.id, price: a.price })),
      productionDays,
    };
  },
  async site() {
    await ensureCatalog();
    // Первая посадочная страница каждого вида книги: туда бот ведёт, когда страницы под получателя нет (автобиография,
    // своя книга, «бабушке»); у вида без своей страницы — каталог примеров /kniga.
    const themeLandings: Record<string, string> = {};
    for (const l of landings) themeLandings[l.theme] ??= l.slug;
    return { url: env.appUrl, registrationOpen: registrationOpen(), themes: BOT_THEMES.filter((t) => isThemeId(t)), landings: landings.map((l) => l.slug), themeLandings };
  },
};
