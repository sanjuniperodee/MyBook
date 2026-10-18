import type { Locale } from "@/i18n/config";

/** Адрес RSS-ленты блога: одна лента, язык — параметром (адреса с расширением не локализуются префиксом /kk). */
export const rssPath = (locale: Locale) => (locale === "kk" ? "/blog/rss.xml?l=kk" : "/blog/rss.xml");
