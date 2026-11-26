"use server";

import { getLocale } from "@/i18n/server";
import { uuid } from "@/web/input";
import { requireUser } from "@/web/auth";
import { getAccessibleBook } from "@/web/books";
import type { BookNav } from "./book-nav";
import { loadBookNav } from "./nav-data";

/** Свежее состояние пути книги для ленты разделов: layout не перерисовывается при переходах внутри книги. */
export async function bookNavAction(rawBookId: string): Promise<BookNav> {
  const bookId = uuid.parse(rawBookId);
  const user = await requireUser();
  const book = await getAccessibleBook(bookId, user);
  return loadBookNav(book, await getLocale());
}
