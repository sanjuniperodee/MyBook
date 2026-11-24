/**
 * Книги клиента: список, книга для редактора, автосохранение ответа. Доступ — как у сайта (apiBook/apiViewer: владелец
 * или сотрудник с правом, «только свои»), модель редактора — та же editorModel, что у страницы вопросов.
 */
import type { z } from "zod";
import type { BookSummary, Question } from "@mybook/contracts";
import { bookKind } from "@/lib/content/kinds";
import { editorModel } from "@/lib/book/editor-data";
import type { EditorQuestion } from "@/lib/book/editor-model";
import { isBookEditableBy } from "@/modules/authoring";
import { apiBook, apiViewer } from "@/server/api";
import { container } from "@/server/container";
import type { Handlers } from "../app";

type UserBookRow = Awaited<ReturnType<ReturnType<typeof container>["authoring"]["queries"]["userBooks"]>>[number];

const toBookSummary = (r: UserBookRow): z.output<typeof BookSummary> => ({
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

export const bookHandlers: Pick<Handlers, "booksList" | "bookEditor" | "questionSave"> = {
  async booksList({ user }) {
    const rows = await container().authoring.queries.userBooks(user!.id);
    return { books: rows.map(toBookSummary) };
  },

  async bookEditor({ req, input }) {
    const { book, viewer } = await apiBook(req, input.bookId);
    const q = container().authoring.queries;
    const [rows, chapters, photos, letters] = await Promise.all([q.questions(book.id), q.chapters(book.id), q.photos(book.id), q.approvedLetters(book.id)]);
    const model = editorModel(book, rows, chapters, photos, letters);
    return {
      book: { id: book.id, title: book.title, theme: book.theme, status: book.status, language: book.language === "kk" ? "kk" : "ru", kind: bookKind(book.theme) },
      editable: book.status === "draft" && isBookEditableBy(book.userId, viewer),
      chapters: model.chapters,
      questions: model.questions.map(toQuestion),
    };
  },

  async questionSave({ req, input }) {
    const { viewer } = await apiViewer(req, input.bookId);
    await container().authoring.questions.edit(input.bookId, viewer, input.questionId, input.body);
    return { ok: true, updatedAt: new Date().toISOString() };
  },
};
