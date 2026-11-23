/**
 * Языки бота и частые вопросы — отдельно от понимания сообщений (botNlu): настройки бота в админке (браузер) берут
 * только эти константы, а регулярные выражения botNlu с lookbehind в браузер попадать не должны (Safari до 16.4 их не знает).
 */

/**
 * Язык клиента в беседе: русский, казахский, узбекский, английский. AI-продажник отвечает на любом из них сам;
 * тексты, которые владелец правит в настройках (вопросы, ответы на частые вопросы, акция), — только ru и kk (TextLang).
 */
export type BotLang = "ru" | "kk" | "uz" | "en";
export const BOT_ALL_LANGS: readonly BotLang[] = ["ru", "kk", "uz", "en"];
export const isBotLang = (v: unknown): v is BotLang => typeof v === "string" && (BOT_ALL_LANGS as readonly string[]).includes(v);

/** Языки текстов из настроек бота: узбекам и англоязычным шаблоны идут по-русски (русский в Казахстане понимают все). */
export type TextLang = "ru" | "kk";
export const textLang = (lang: BotLang): TextLang => (lang === "kk" ? "kk" : "ru");

/** Название языка для CRM: «казахский», «узбекский»… */
export const BOT_LANG_LABELS: Record<BotLang, string> = { ru: "русский", kk: "казахский", uz: "узбекский", en: "английский" };

/** Частые вопросы, на которые бот отвечает шаблоном из настроек. */
export type FaqIntent = "price" | "delivery" | "timing" | "how" | "payment" | "examples" | "language";
export const FAQ_INTENTS: readonly FaqIntent[] = ["price", "how", "timing", "delivery", "payment", "examples", "language"];
