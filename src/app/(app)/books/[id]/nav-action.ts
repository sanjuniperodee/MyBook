"use server";

import { getLocale } from "@/i18n/server";
import { uuid } from "@/server/input";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import type { BookNav } from "./book-nav";
import { loadBookNav } from "./nav-data";

/** Свежее состояние пути книги для ленты разделов: layout не перерисовывается при переходах внутри книги. */
export async function bookNavAction(rawBookId: string): Promise<BookNav> {
  const bookId = uuid.parse(rawBookId);
  const user = await requireUser();
  const book = await getAccessibleBook(bookId, user);
  return loadBookNav(book, await getLocale());
}
