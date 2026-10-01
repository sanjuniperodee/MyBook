import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { BookRow, BookViewer } from "@/modules/authoring";
import { isStaff, type User } from "./auth";
import { container } from "./container";

/** Кто смотрит книгу: владелец или сотрудник CRM. */
export const viewerOf = (user: Pick<User, "id" | "role" | "staffDisabled">): BookViewer => ({ userId: user.id, isStaff: isStaff(user) });

/** Книга текущего пользователя (или любая — для сотрудника); чужая — 404. Кэш на запрос. */
export const getAccessibleBook = cache(async (bookId: string, user: User): Promise<BookRow> => {
  const book = await container().authoring.queries.visibleBook(bookId, viewerOf(user));
  if (!book) notFound();
  return book;
});

export const isEditable = (book: Pick<BookRow, "status">) => book.status === "draft";
