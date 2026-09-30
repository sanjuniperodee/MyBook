/**
 * Языки сайта. Русский — по умолчанию и без префикса в адресе, казахский — под /kk/…
 * (отдельные адреса нужны поисковикам: hreflang и индексация обеих версий).
 * Модуль общий для сервера, браузера и proxy — без зависимостей.
 */
export const locales = ["ru", "kk"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ru";

/** Выбор пользователя; proxy по нему возвращает человека на его язык. */
export const LOCALE_COOKIE = "mb_locale";
/** Заголовок, которым proxy сообщает серверу язык запроса. */
export const LOCALE_HEADER = "x-mb-locale";

export const localeMeta: Record<Locale, { label: string; short: string; intl: string; og: string; speech: string }> = {
  ru: { label: "Русский", short: "Рус", intl: "ru-RU", og: "ru_RU", speech: "ru-RU" },
  kk: { label: "Қазақша", short: "Қаз", intl: "kk-KZ", og: "kk_KZ", speech: "kk-KZ" },
};

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (locales as readonly string[]).includes(v);
}

/** Пути, которые не локализуются (API, CRM, служебные страницы, файлы). */
const UNLOCALIZED = /^\/(api|admin|print|_next)(\/|$)|\.[a-z0-9]+$/i;

/** Адрес страницы на нужном языке: «/books» → «/kk/books». Внешние ссылки и якоря не трогает. */
export function localizePath(href: string, locale: Locale): string {
  if (locale === defaultLocale || !href.startsWith("/") || href.startsWith("//") || UNLOCALIZED.test(href.split(/[?#]/)[0])) return href;
  if (href === "/kk" || href.startsWith("/kk/") || href.startsWith("/kk?") || href.startsWith("/kk#")) return href;
  return href === "/" ? "/kk" : href.startsWith("/?") || href.startsWith("/#") ? `/kk${href.slice(1)}` : `/kk${href}`;
}

/** Разбирает адрес из браузера: «/kk/books» → { locale: "kk", path: "/books" }. */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  if (pathname === "/kk" || pathname.startsWith("/kk/")) return { locale: "kk", path: pathname.slice(3) || "/" };
  return { locale: defaultLocale, path: pathname };
}

/** Язык открытой страницы в браузере (для кода вне React: fetch-обёртки, диктовка). */
export function clientLocale(): Locale {
  if (typeof document === "undefined") return defaultLocale;
  const lang = document.documentElement.lang;
  return isLocale(lang) ? lang : defaultLocale;
}
