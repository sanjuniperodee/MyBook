/**
 * API v1 (ADR 0012): единственный путь к данным для веба и мобильного приложения. Контракт первым: схемы запросов и
 * ответов (zod) — здесь; из них — OpenAPI (/api/v1/openapi.json), TS-клиент (../client.ts) и Dart-клиент
 * (mobile/lib/api/mybook_api.g.dart, scripts/contracts/generate.ts). Сервер — apps/api.
 *
 * Правила: имя маршрута — имя метода клиентов (camelCase); даты — строки ISO 8601; ответ без тела — `ok`.
 * Поменять существующий ответ несовместимо нельзя — только новый маршрут или необязательное поле.
 */
import { z } from "zod";

export type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
/** Кто может звать: none — без входа (вход, вебхуки), user — любой вошедший (права на ресурс проверяет сервер), staff — сотрудник CRM. */
export type Auth = "none" | "user" | "staff";

export interface RouteDef {
  method: Method;
  /** Путь с параметрами в фигурных скобках: /api/v1/books/{bookId}. */
  path: string;
  auth: Auth;
  tag: string;
  summary: string;
  params?: z.ZodObject;
  query?: z.ZodObject;
  body?: z.ZodType;
  response: z.ZodType;
}

const route = <R extends RouteDef>(r: R) => r;
/** Схемы с именем — компоненты OpenAPI и классы Dart-клиента. Свой реестр: чужие схемы zod в него не попадут. */
export const schemas = z.registry<{ id: string }>();
const iso = z.iso.datetime({ offset: true });
const uuid = z.uuid();

// ─── Общее ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Ошибка: текст для экрана на языке пользователя и код (стабильный, по нему ветвится клиент). */
export const ApiError = z.object({ error: z.string(), code: z.string().optional() }).register(schemas, { id: "ApiError" });
export const Ok = z.object({ ok: z.literal(true) }).register(schemas, { id: "Ok" });

// ─── Вход ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export const User = z
  .object({
    id: uuid,
    name: z.string(),
    email: z.string(),
    phone: z.string().nullable(),
    locale: z.enum(["ru", "kk"]),
    isStaff: z.boolean(),
  })
  .register(schemas, { id: "User" });

export const Session = z
  .object({
    /** Токен сессии: Authorization: Bearer <token>. Веб получает тот же токен в cookie mb_session. */
    token: z.string(),
    expiresAt: iso,
    user: User,
  })
  .register(schemas, { id: "Session" });

/** Ответ входа: сессия или второй шаг (сотрудник с 2FA) — билет на 5 минут для auth2fa. */
export const LoginResult = z
  .object({
    session: Session.nullable(),
    secondFactorTicket: z.string().nullable(),
  })
  .register(schemas, { id: "LoginResult" });

export const LoginBody = z
  .object({
    /** Почта или телефон — как на сайте. */
    login: z.string().trim().min(1).max(200),
    password: z.string().min(1).max(200),
  })
  .register(schemas, { id: "LoginBody" });

export const SecondFactorBody = z.object({ ticket: z.string().min(10).max(300), code: z.string().trim().min(4).max(40) }).register(schemas, { id: "SecondFactorBody" });

// ─── Книги ────────────────────────────────────────────────────────────────────────────────────────────────────────

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

// ─── Маршруты ─────────────────────────────────────────────────────────────────────────────────────────────────────

const BookParams = z.object({ bookId: uuid });

export const v1 = {
  authLogin: route({ method: "POST", path: "/api/v1/auth/login", auth: "none", tag: "auth", summary: "Вход по почте или телефону и паролю (клиент и сотрудник)", body: LoginBody, response: LoginResult }),
  authSecondFactor: route({ method: "POST", path: "/api/v1/auth/2fa", auth: "none", tag: "auth", summary: "Второй шаг входа сотрудника: код из приложения-аутентификатора", body: SecondFactorBody, response: Session }),
  authLogout: route({ method: "POST", path: "/api/v1/auth/logout", auth: "user", tag: "auth", summary: "Выход: сессия токена закрывается", response: Ok }),
  me: route({ method: "GET", path: "/api/v1/me", auth: "user", tag: "auth", summary: "Кто вошёл", response: User }),

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

export type V1 = typeof v1;
export type RouteName = keyof V1;
export type Input<N extends RouteName> = (V1[N] extends { params: infer P extends z.ZodType } ? z.input<P> : unknown) &
  (V1[N] extends { query: infer Q extends z.ZodType } ? z.input<Q> : unknown) &
  (V1[N] extends { body: infer B extends z.ZodType } ? { body: z.input<B> } : unknown);
export type Output<N extends RouteName> = z.output<V1[N]["response"]>;
