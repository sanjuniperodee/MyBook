/**
 * Языки бота и частые вопросы — отдельно от понимания сообщений (botNlu): настройки бота в админке (браузер) берут
 * только эти константы, а регулярные выражения botNlu с lookbehind в браузер попадать не должны (Safari до 16.4 их не знает).
 */

export type BotLang = "ru" | "kk";

/** Частые вопросы, на которые бот отвечает шаблоном из настроек. */
export type FaqIntent = "price" | "delivery" | "timing" | "how" | "payment" | "examples" | "language";
export const FAQ_INTENTS: readonly FaqIntent[] = ["price", "how", "timing", "delivery", "payment", "examples", "language"];
