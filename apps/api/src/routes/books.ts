/**
 * Книги клиента: виды книг, создание, список, книга для редактора, автосохранение ответа. Доступ — как у сайта
 * (apiBook/apiViewer: владелец или сотрудник с правом, «только свои»); сборка DTO — в authoring/ui/booksView.ts;
 * создание — та же схема мастера и BookService.start, что у server action сайта.
 */
import { createBookSchema, startBookInput } from "@/lib/book/create-book-schema";
import { isLocale } from "@/i18n/config";
import { getLocale, getMessages } from "@/i18n/server";
import { getThemes } from "@/lib/content/themes";
import { buildBookEditorView, toBookSummary, toTheme } from "@/modules/authoring/ui/booksView";
import { isPrintedPlan, lastOrderPerBook } from "@/modules/ordering/ui/status";
import { apiBook, apiViewer } from "@/server/api";
import { container } from "@/server/container";
import { maxPhotos } from "@/server/photoLimit";
import type { Handlers } from "../app";

export const bookHandlers: Pick<Handlers, "themesList" | "bookCreate" | "booksList" | "bookEditor" | "questionSave"> = {
  async themesList({ input }) {
    const locale = input.locale ?? (await getLocale());
    return { themes: getThemes(isLocale(locale) ? locale : "ru").map(toTheme) };
  },

  async bookCreate({ user, input }) {
    const m = await getMessages();
    const parsed = createBookSchema(m.books.wizard.errors).safeParse(input.body);
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message, code: "badData" }, { status: 400 });
    const book = await container().authoring.books.start(user!.id, startBookInput(parsed.data));
    return { id: book.id };
  },

  async booksList({ user }) {
    const [rows, orders] = await Promise.all([container().authoring.queries.userBooks(user!.id), container().ordering.queries.userOrders(user!.id)]);
    const last = lastOrderPerBook(orders);
    return {
      books: rows.map((r) => {
        const order = last.get(r.book.id);
        return toBookSummary(r, order ? { id: order.id, number: order.number, status: order.status, printed: isPrintedPlan(order.plan) } : null);
      }),
    };
  },

  async bookEditor({ req, input }) {
    const { book, viewer } = await apiBook(req, input.bookId);
    const q = container().authoring.queries;
    const [questions, chapters, photos, letters, limit] = await Promise.all([q.questions(book.id), q.chapters(book.id), q.photos(book.id), q.approvedLetters(book.id), maxPhotos()]);
    return buildBookEditorView({ book, viewer, questions, chapters, photos, letters, maxPhotos: limit });
  },

  async questionSave({ req, input }) {
    const { viewer } = await apiViewer(req, input.bookId);
    await container().authoring.questions.edit(input.bookId, viewer, input.questionId, input.body);
    return { ok: true, updatedAt: new Date().toISOString() };
  },
};
