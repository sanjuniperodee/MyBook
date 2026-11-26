import "server-only";
import type { BookRow } from "@/modules/authoring";
import type { Locale } from "@/i18n/config";
import type { BadgeTone } from "@/components/ui/Badge";
import { localBookNav, localBookShellNav } from "@/server/v1-local-bridge-book";
import { v1WebRead } from "@/server/v1-web-client";
import type { BookNav } from "./book-nav";

export interface BookShellNav {
  nav: BookNav;
  orderState: { label: string; tone: BadgeTone } | null;
}

/**
 * Состояние пути книги для ленты разделов: несколько лёгких запросов (счётчики ответов одним SQL, письма, последний
 * заказ) — без сборки макета и без списка фото. Тот же расчёт, что на обзоре книги (bookNav).
 */
export async function loadBookNav(book: BookRow, locale: Locale): Promise<BookNav> {
  return v1WebRead({
    name: "book.nav",
    section: "book",
    locale,
    local: () => localBookNav(book, locale),
    viaApi: async (api) => (await api.webBookNav({ bookId: book.id, locale })).nav,
  });
}

/** Навигация и состояние заказа для шапки книги (`layout.tsx`). */
export async function loadBookShellNav(book: BookRow, locale: Locale): Promise<BookShellNav> {
  return v1WebRead({
    name: "book.layoutNav",
    section: "book",
    locale,
    local: () => localBookShellNav(book, locale),
    viaApi: (api) => api.webBookNav({ bookId: book.id, locale }),
  });
}
