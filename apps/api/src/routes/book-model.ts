/**
 * Объёмная модель книги для 3D-книги приложения: сборка вынесена в authoring/ui/bookModelView.ts (общая с бэкендом на Nest).
 * Страниц — из запроса (сборка, которую показывает приложение), иначе из готовой сборки, иначе оценка (как в штабе книги).
 */
import { getMessages } from "@/i18n/server";
import { buildBookModelView } from "@/modules/authoring/ui/bookModelView";
import { apiBook } from "@/server/api";
import { container } from "@/server/container";
import type { Handlers } from "../app";

export const bookModelHandlers: Pick<Handlers, "bookModel"> = {
  async bookModel({ req, input }) {
    const { book } = await apiBook(req, input.bookId);
    const pages =
      input.pages ??
      (await container().previews.current(book.id).catch(() => null))?.pageCount ??
      (await container().authoring.queries.stats(book)).printedPages;
    return buildBookModelView(book, pages, (await getMessages()).books.preview);
  },
};
