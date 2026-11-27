import "server-only";
import { cache } from "react";
import { notFound } from "@/shared/infrastructure/http/request";
import { ApiClientError } from "@mybook/contracts";
import { pageId } from "./input";
import type { BookRow, BookViewer } from "@/modules/authoring";
import type { User } from "./auth";
import { fromWebBookRow, localViewerOf, localVisibleBook } from "./v1-local-bridge-book";
import { v1WebRead } from "./v1-web-client";

const isNotFoundApiError = (err: unknown): boolean =>
  (err instanceof ApiClientError && err.status === 404) ||
  (typeof err === "object" && err !== null && "status" in err && (err as { status?: unknown }).status === 404);

/**
 * Кто смотрит книгу: владелец или сотрудник CRM. Книги клиентов открыты сотруднику с правом clients.view (менять —
 * ещё и clients.edit), вошедшему из разрешённой сети и с 2FA, если она обязательна (getStaff) — решение 1 (V1).
 * Роль «только свои» — только книги своих клиентов: доступ сотрудника решается по книге bookId; без неё — как у клиента
 * (только свои книги). user — текущий пользователь запроса.
 */
export async function viewerOf(user: Pick<User, "id" | "role" | "staffDisabled">, bookId?: string | null): Promise<BookViewer> {
  return localViewerOf(user, bookId);
}

/** Книга текущего пользователя (или любая — для сотрудника); чужая — 404. Кэш на запрос. */
export const getAccessibleBook = cache(async (bookId: string, user: User): Promise<BookRow> => {
  pageId(bookId);
  const book = await v1WebRead<BookRow | null>({
    name: "book.accessible",
    section: "book",
    local: () => localVisibleBook(bookId, user),
    viaApi: async (api) => {
      try {
        const res = await api.webBook({ bookId });
        return fromWebBookRow(res.book);
      } catch (err) {
        if (isNotFoundApiError(err)) return null;
        throw err;
      }
    },
  });
  if (!book) notFound();
  return book;
});
