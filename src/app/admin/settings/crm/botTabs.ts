/** Разделы формы бота (вкладки внутри «Бот»). Отдельный файл без "use client": значения нужны и серверной странице. */
export type BotFormTab = "mode" | "qualifier" | "sell" | "test";
export const BOT_FORM_TABS: BotFormTab[] = ["mode", "qualifier", "sell", "test"];
