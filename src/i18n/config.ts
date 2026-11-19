/**
 * Языки сайта. Русский — по умолчанию и без префикса в адресе, казахский — под /kk/…, узбекский (латиница) — под /uz/…
 * (отдельные адреса нужны поисковикам: hreflang и индексация всех версий).
 * Модуль общий для сервера, браузера и proxy — без зависимостей.
 */
export const locales = ["ru", "kk", "uz"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ru";

/** Языки публичного сайта: лендинг, /kniga, статьи, инструменты. Сейчас совпадают со всеми языками. */
export const publicLocales = locales;
export type PublicLocale = Locale;
/** Язык публичного текста (когда языка нет в публичных текстах, показывается русский). */
export const toPublic = (locale: Locale): PublicLocale => locale;
/** Префикс адреса, под которым живёт язык (русский — без префикса). */
const PREFIX: Record<Exclude<Locale, "ru">, string> = { kk: "/kk", uz: "/uz" };
/** Есть ли у этого пути (без префикса языка) версия на языке: у всех страниц сайта есть все три языка. */
export const hasLocalePath = (path: string, locale: Locale) => path.startsWith("/") && locales.includes(locale);

/** Выбор пользователя; proxy по нему возвращает человека на его язык. */
export const LOCALE_COOKIE = "mb_locale";
/** Заголовок, которым proxy сообщает серверу язык запроса. */
export const LOCALE_HEADER = "x-mb-locale";

export const localeMeta: Record<Locale, { label: string; short: string; intl: string; og: string; speech: string }> = {
  ru: { label: "Русский", short: "Рус", intl: "ru-RU", og: "ru_RU", speech: "ru-RU" },
  kk: { label: "Қазақша", short: "Қаз", intl: "kk-KZ", og: "kk_KZ", speech: "kk-KZ" },
  uz: { label: "Oʻzbekcha", short: "Oʻz", intl: "uz-UZ", og: "uz_UZ", speech: "uz-UZ" },
};

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (locales as readonly string[]).includes(v);
}

/** Пути, которые не локализуются (API, CRM, служебные страницы, файлы). */
const UNLOCALIZED = /^\/(api|admin|print|_next)(\/|$)|\.[a-z0-9]+$/i;

/** Адрес страницы на нужном языке: «/books» → «/kk/books». Внешние ссылки и якоря не трогает. */
export function localizePath(href: string, locale: Locale): string {
  if (locale === defaultLocale || !href.startsWith("/") || href.startsWith("//") || UNLOCALIZED.test(href.split(/[?#]/)[0])) return href;
  const prefix = PREFIX[locale as Exclude<Locale, "ru">];
  if (href === prefix || href.startsWith(`${prefix}/`) || href.startsWith(`${prefix}?`) || href.startsWith(`${prefix}#`)) return href;
  return href === "/" ? prefix : href.startsWith("/?") || href.startsWith("/#") ? `${prefix}${href.slice(1)}` : `${prefix}${href}`;
}

/** Разбирает адрес из браузера: «/kk/books» → { locale: "kk", path: "/books" }. */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  for (const l of ["kk", "uz"] as const) {
    const prefix = PREFIX[l];
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return { locale: l, path: pathname.slice(prefix.length) || "/" };
  }
  return { locale: defaultLocale, path: pathname };
}

/** Язык открытой страницы в браузере (для кода вне React: fetch-обёртки, диктовка). */
export function clientLocale(): Locale {
  if (typeof document === "undefined") return defaultLocale;
  const lang = document.documentElement.lang;
  return isLocale(lang) ? lang : defaultLocale;
}
