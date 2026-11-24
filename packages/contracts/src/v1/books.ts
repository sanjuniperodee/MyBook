/** Книги клиента в API v1: список, книга для редактора, автосохранение ответа. */
import { z } from "zod";
import { iso, route, schemas, uuid, type RouteDef } from "./core";

export const BookStatus = z.enum(["draft", "ordered"]);

export const BookSummary = z
  .object({
    id: uuid,
    title: z.string(),
    theme: z.string(),
    status: BookStatus,
    authorName: z.string(),
    recipientName: z.string(),
    updatedAt: iso,
    /** Разделов с текстом / всего разделов, слов в ответах, фото — для полоски прогресса. */
    answered: z.number().int(),
    total: z.number().int(),
    words: z.number().int(),
    photos: z.number().int(),
  })
  .register(schemas, { id: "BookSummary" });

export const BookList = z.object({ books: z.array(BookSummary) }).register(schemas, { id: "BookList" });

export const AnswerMedia = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.enum(["video", "music", "audio"]),
    url: z.string().trim().min(1).max(1200),
    fileId: z.uuid().optional(),
    title: z.string().max(180),
    /** Абзац ответа, после которого стоит QR (-1 — в начале); null — в конце. */
    anchor: z.number().int().min(-1).max(10_000).nullable(),
  })
  .register(schemas, { id: "AnswerMedia" });

export const Question = z
  .object({
    id: uuid,
    chapter: z.string(),
    chapterTitle: z.string(),
    /** Вопрос автору — уже в роде автора и адресата; у раздела своей книги — подсказка для себя. */
    prompt: z.string(),
    hint: z.string().nullable(),
    /** Заголовок в книге по умолчанию; displayText — свой заголовок автора (null — по умолчанию). */
    defaultTitle: z.string(),
    displayText: z.string().nullable(),
    hideHeading: z.boolean(),
    answer: z.string(),
    media: z.array(AnswerMedia),
    isCustom: z.boolean(),
    pageBreak: z.boolean(),
  })
  .register(schemas, { id: "Question" });

export const Chapter = z.object({ key: z.string(), title: z.string(), epigraph: z.string(), own: z.boolean() }).register(schemas, { id: "Chapter" });

export const BookEditor = z
  .object({
    book: z.object({
      id: uuid,
      title: z.string(),
      theme: z.string(),
      status: BookStatus,
      language: z.enum(["ru", "kk"]),
      /** blank — своя книга (главы и разделы автора), иначе — книга с вопросами темы. */
      kind: z.string(),
    }),
    /** Можно править: черновик и (для сотрудника) есть право правки. */
    editable: z.boolean(),
    chapters: z.array(Chapter),
    questions: z.array(Question),
  })
  .register(schemas, { id: "BookEditor" });

/** Лимиты и ключи ошибок — как у маршрута сайта (сверяет tests/api-v1.test.ts с константами приложения). */
export const QuestionPatch = z
  .object({
    answer: z.string().max(100_000, "answerTooLong"),
    displayText: z.string().trim().max(200).nullable(),
    hideHeading: z.boolean(),
    pageBreak: z.boolean(),
    media: z.array(AnswerMedia).max(8, "tooManyMedia"),
    title: z.string().trim().max(200, "sectionTitleTooLong"),
    prompt: z.string().trim().max(300),
  })
  .partial()
  .strict()
  .register(schemas, { id: "QuestionPatch" });

export const Saved = z.object({ ok: z.literal(true), updatedAt: iso }).register(schemas, { id: "Saved" });

const BookParams = z.object({ bookId: uuid });

export const booksRoutes = {
  booksList: route({ method: "GET", path: "/api/v1/books", auth: "user", tag: "books", summary: "Мои книги с прогрессом", response: BookList }),
  bookEditor: route({ method: "GET", path: "/api/v1/books/{bookId}/editor", auth: "user", tag: "books", summary: "Книга для редактора: главы и вопросы с ответами", params: BookParams, response: BookEditor }),
  questionSave: route({
    method: "PATCH",
    path: "/api/v1/books/{bookId}/questions/{questionId}",
    auth: "user",
    tag: "books",
    summary: "Автосохранение ответа и заголовка раздела (только изменённые поля)",
    params: z.object({ bookId: uuid, questionId: uuid }),
    body: QuestionPatch,
    response: Saved,
  }),
} as const satisfies Record<string, RouteDef>;
