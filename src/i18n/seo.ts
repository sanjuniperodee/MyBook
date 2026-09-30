import { localizePath, type Locale } from "./config";

/** canonical и hreflang для публичной страницы: обе языковые версии ссылаются друг на друга. */
export function alternates(path: string, locale: Locale) {
  return {
    canonical: localizePath(path, locale),
    languages: { ru: path, kk: localizePath(path, "kk"), "x-default": path },
  };
}
