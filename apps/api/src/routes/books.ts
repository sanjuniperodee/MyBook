/**
 * Книги клиента: виды книг, создание, список, книга для редактора, автосохранение ответа. Доступ — как у сайта
 * (apiBook/apiViewer: владелец или сотрудник с правом, «только свои»); модель редактора — та же editorModel, что у
 * страницы вопросов; создание — та же схема мастера и BookService.start, что у server action сайта.
 */
import type { z } from "zod";
import type { BookSummary, OrderBrief, Question, Theme } from "@mybook/contracts";
import { createBookSchema, startBookInput } from "@/lib/book/create-book-schema";
import { isLocale } from "@/i18n/config";
import { getLocale, getMessages } from "@/i18n/server";
import { bookKind } from "@/lib/content/kinds";
import { getThemes } from "@/lib/content/themes";
import type { ThemeDef } from "@/lib/content/types";
import { editorModel } from "@/lib/book/editor-data";
import type { EditorQuestion } from "@/lib/book/editor-model";
import { photoUrl } from "@/lib/urls";
import { isBookEditableBy } from "@/modules/authoring";
import { isPrintedPlan, lastOrderPerBook } from "@/modules/ordering/ui/status";
import { apiBook, apiViewer } from "@/server/api";
import { container } from "@/server/container";
import { maxPhotos } from "@/server/photoLimit";
import type { Handlers } from "../app";
import { toPhoto } from "./photos";

type Queries = ReturnType<typeof container>;
type UserBookRow = Awaited<ReturnType<Queries["authoring"]["queries"]["userBooks"]>>[number];
type UserOrder = Awaited<ReturnType<Queries["ordering"]["queries"]["userOrders"]>>[number];

const toTheme = (t: ThemeDef): z.output<typeof Theme> => ({
  id: t.id,
  kind: t.kind,
  recipient: t.recipient,
  name: t.name,
  short: t.short,
  description: t.description,
  emoji: t.emoji,
  recipientLabel: t.recipientLabel ?? null,
  recipientPlaceholder: t.recipientPlaceholder ?? null,
  recipientGender: t.recipientGender ?? null,
  recipientGenderChoice: t.recipientGenderChoice ?? false,
  defaultRecipientGender: t.defaultRecipientGender,
  titleSuggestions: t.titleSuggestions,
});

const toOrderBrief = (o: UserOrder): z.output<typeof OrderBrief> => ({ id: o.id, number: o.number, status: o.status, printed: isPrintedPlan(o.plan) });

const toBookSummary = (r: UserBookRow, order: UserOrder | undefined): z.output<typeof BookSummary> => ({
  id: r.book.id,
  title: r.book.title,
  theme: r.book.theme,
  status: r.book.status,
  authorName: r.book.authorName,
  recipientName: r.book.recipientName,
  updatedAt: r.book.updatedAt.toISOString(),
  answered: r.answered,
  total: r.total,
  words: r.words,
  photos: r.photos,
  coverTemplate: r.book.coverTemplate,
  coverPhotoUrl: r.book.coverPhotoId ? photoUrl(r.book.coverPhotoId, "thumb") : null,
  order: order ? toOrderBrief(order) : null,
});

const toQuestion = (q: EditorQuestion): z.output<typeof Question> => ({
  id: q.id,
  chapter: q.chapter,
  chapterTitle: q.chapterTitle,
  prompt: q.prompt,
  hint: q.hint,
  defaultTitle: q.defaultTitle,
  displayText: q.displayText,
  hideHeading: q.hideHeading,
  answer: q.answer,
  media: q.media.map((m) => ({ id: m.id, kind: m.kind, url: m.url, ...(m.fileId ? { fileId: m.fileId } : {}), title: m.title, anchor: m.anchor ?? null })),
  isCustom: q.isCustom,
  pageBreak: q.pageBreak ?? false,
});

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
    return { books: rows.map((r) => toBookSummary(r, last.get(r.book.id))) };
  },

  async bookEditor({ req, input }) {
    const { book, viewer } = await apiBook(req, input.bookId);
    const q = container().authoring.queries;
    const [rows, chapters, photos, letters, limit] = await Promise.all([q.questions(book.id), q.chapters(book.id), q.photos(book.id), q.approvedLetters(book.id), maxPhotos()]);
    const model = editorModel(book, rows, chapters, photos, letters);
    return {
      book: { id: book.id, title: book.title, theme: book.theme, status: book.status, language: book.language === "kk" ? "kk" : "ru", kind: bookKind(book.theme) },
      editable: book.status === "draft" && isBookEditableBy(book.userId, viewer),
      chapters: model.chapters,
      questions: model.questions.map(toQuestion),
      photos: model.photos.map(toPhoto),
      maxPhotos: limit,
    };
  },

  async questionSave({ req, input }) {
    const { viewer } = await apiViewer(req, input.bookId);
    await container().authoring.questions.edit(input.bookId, viewer, input.questionId, input.body);
    return { ok: true, updatedAt: new Date().toISOString() };
  },
};
