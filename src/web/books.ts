import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { ApiClientError } from "@mybook/contracts";
import { pageId } from "./input";
import type { BookRow } from "@/modules/authoring";
import type { User } from "./auth";
import { fromWebBookRow } from "@/web/dto";
import { v1WebRead } from "./api";

const isNotFoundApiError = (err: unknown): boolean =>
  (err instanceof ApiClientError && err.status === 404) ||
  (typeof err === "object" && err !== null && "status" in err && (err as { status?: unknown }).status === 404);

/** Книга текущего пользователя (или любая — для сотрудника); чужая — 404. Кэш на запрос. */
export const getAccessibleBook = cache(async (bookId: string, _user: User): Promise<BookRow> => {
  pageId(bookId);
  const book = await v1WebRead<BookRow | null>({
    name: "book.accessible",
    section: "book",
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
