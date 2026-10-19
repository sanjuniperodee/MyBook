import "server-only";
import { formatPrice } from "@/config/site";
import { admin } from "@/i18n/admin";
import { getSetting } from "@/modules/workspace";
import { BOT_LANGS, parseBotConfig } from "@/modules/messaging/domain/botConfig";
import { faqIntentLabels, pricesOutsideCatalog } from "@/modules/messaging/domain/botFaq";
import { FAQ_INTENTS } from "@/modules/messaging/domain/botNlu";
import { staleAmounts } from "@/modules/messaging/domain/botSeller";
import { botSiteInfo } from "./bot-site";

/**
 * Где у бота суммы, которых нет в «Ценах и тарифах» (deals-d13): база знаний AI — бот вправе назвать сумму оттуда, — и
 * включённые ответы на частые вопросы. После подъёма прайса бот назвал бы старую цену, поэтому владельцу — предупреждение
 * при сохранении прайса и базы знаний (сохранению оно не мешает). knowledge — новая база знаний, иначе — из настроек;
 * faq: false — только база знаний. Пусто — расхождений нет.
 */
export async function botPriceDrift(opts: { knowledge?: string; faq?: boolean } = {}): Promise<string[]> {
  const [catalog, raw, saved] = await Promise.all([botSiteInfo.catalog(), getSetting("bot.config"), opts.knowledge ?? getSetting("ai.knowledge")]);
  const config = parseBotConfig(raw);
  const out: string[] = [];
  const kb = staleAmounts(saved ?? "", catalog, config.sell);
  if (kb.length) out.push(admin.botPriceDriftKnowledge(kb.map(formatPrice).join(", ")));
  for (const i of opts.faq === false ? [] : FAQ_INTENTS) {
    if (!config.faq[i]?.on) continue;
    for (const l of BOT_LANGS) {
      const found = pricesOutsideCatalog(config.faq[i].text[l], catalog);
      if (found.length) out.push(admin.botPriceDriftFaq(faqIntentLabels[i], l.toUpperCase(), found.join(", ")));
    }
  }
  return out;
}

/** Предупреждение владельцу текстом; null — расхождений нет. */
export const botPriceWarning = (drift: string[]) => (drift.length ? admin.botPriceDrift(drift.join("; ")) : null);
