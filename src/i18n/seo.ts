import { localizePath, type Locale } from "./config";

/** canonical и hreflang для публичной страницы: все языковые версии ссылаются друг на друга. */
export function alternates(path: string, locale: Locale) {
  return {
    canonical: localizePath(path, locale),
    languages: { ru: path, kk: localizePath(path, "kk"), uz: localizePath(path, "uz"), en: localizePath(path, "en"), "x-default": path },
  };
}
