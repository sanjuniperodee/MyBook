/** Книги клиента в API v1: виды книг, создание, список, книга для редактора (с фото), автосохранение ответа. */
import { z } from "zod";
import { Ok, iso, route, schemas, uuid, type RouteDef } from "./core";

export const BookStatus = z.enum(["draft", "ordered"]);
const Gender = z.enum(["m", "f"]);
const Locale = z.enum(["ru", "kk"]);

/** Вид книги для мастера создания — как карточки «Какую книгу пишем» на сайте. */
export const Theme = z
  .object({
    id: z.string(),
    /** gift — подарок, autobiography — о себе, blank — своя книга. */
    kind: z.enum(["gift", "autobiography", "blank"]),
    /** Получатель: required — обязателен, optional — по желанию, none — нет. */
    recipient: z.enum(["required", "optional", "none"]),
    name: z.string(),
    short: z.string(),
    description: z.string(),
    emoji: z.string(),
    recipientLabel: z.string().nullable(),
    recipientPlaceholder: z.string().nullable(),
    /** Род адресата фиксирован (мама/папа) — иначе null. */
    recipientGender: Gender.nullable(),
    recipientGenderChoice: z.boolean(),
    defaultRecipientGender: Gender,
    titleSuggestions: z.array(z.string()),
  })
  .register(schemas, { id: "Theme" });

export const ThemeList = z.object({ themes: z.array(Theme) }).register(schemas, { id: "ThemeList" });

/** Мастер новой книги. Правила вида (получатель, название своей книги) проверяет сервер — как на сайте. */
export const CreateBookBody = z
  .object({
    theme: z.string(),
    language: Locale.default("ru"),
    authorName: z.string().max(60),
    authorGender: Gender,
    recipientName: z.string().max(60).optional(),
    recipientGender: Gender.optional(),
    /** Автобиография: кто записал. */
    recordedBy: z.string().optional(),
    /** Своя книга: название первой главы (пусто — по умолчанию). */
    firstChapterTitle: z.string().optional(),
    /** Автобиография: кому посвящаете. */
    dedication: z.string().optional(),
    title: z.string().max(80).optional(),
    occasion: z.string().optional(),
    /** ГГГГ-ММ-ДД. */
    occasionDate: z.string().optional(),
  })
  .register(schemas, { id: "CreateBookBody" });

export const CreatedBook = z.object({ id: uuid }).register(schemas, { id: "CreatedBook" });

export const OrderBrief = z
  .object({
    id: uuid,
    number: z.number().int(),
    /** Статус заказа (new, paid, printing, shipped, delivered, cancelled …). */
    status: z.string(),
    /** false — электронная версия (печатать нечего). */
    printed: z.boolean(),
  })
  .register(schemas, { id: "OrderBrief" });

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
    /** Шаблон обложки и снимок на ней (путь от сайта, с тем же Bearer); нет снимка — null. */
    coverTemplate: z.string(),
    coverPhotoUrl: z.string().nullable(),
    /** Последний заказ книги (отменённый не заслоняет действующий); нет — null. */
    order: OrderBrief.nullable(),
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

/** Фото книги в редакторе: место (questionId — у ответа, null — в альбоме), подпись, раскладка, адреса картинок. */
export const Photo = z
  .object({
    id: uuid,
    width: z.number().int(),
    height: z.number().int(),
    caption: z.string(),
    layout: z.enum(["full", "bleed", "half", "grid"]),
    questionId: uuid.nullable(),
    /** Пути от сайта (с тем же Bearer): миниатюра и снимок для просмотра. */
    thumbUrl: z.string(),
    url: z.string(),
  })
  .register(schemas, { id: "Photo" });

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
    photos: z.array(Photo),
    /** Сколько фото можно в книге (настройка сайта). */
    maxPhotos: z.number().int(),
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

/** Правка фото (одна): подпись, раскладка, место, кадр, стиль в тексте. Правила места проверяет домен (Photo.update). Лимиты — как у сайта. */
export const PhotoPatch = z
  .object({
    caption: z.string().trim().max(200),
    layout: z.enum(["full", "bleed", "half", "grid"]),
    questionId: uuid.nullable(),
    inline: z
      .object({
        width: z.number().min(25).max(100),
        align: z.enum(["left", "center", "right"]),
        anchor: z.number().int().min(-1).max(10_000).nullable(),
        aspect: z.enum(["original", "1:1", "4:3", "3:4", "16:9"]),
        focusX: z.number().min(0).max(1),
        focusY: z.number().min(0).max(1),
        frame: z.enum(["none", "line", "polaroid", "round"]),
        page: z.boolean().optional(),
        pageFit: z.literal("contain").optional(),
        keepSize: z.boolean().optional(),
        // Отступ сверху — доля полосы набора; предел (0,6) приводит normalizeStyle.
        spaceAbove: z.number().min(0).max(1).optional(),
        breakBefore: z.boolean().optional(),
      })
      .strict()
      .nullable(),
    chapter: z.string().regex(/^[\w-]{1,80}$/).nullable(),
    opener: z.boolean(),
    // Кадр автора: точка (доли снимка) и приближение (до 3); пределы приводит домен (normalizeCrop).
    crop: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), zoom: z.number().min(1).max(3) }).strict().nullable(),
  })
  .partial()
  .strict()
  .register(schemas, { id: "PhotoPatch" });

/** Итог загрузки: новые фото и ошибки по файлам (текст на языке пользователя: формат, размер, повреждён). */
export const PhotoUploadResult = z.object({ photos: z.array(Photo), errors: z.array(z.string()) }).register(schemas, { id: "PhotoUploadResult" });

/** Фото после правки и версия правил раскладки книги (правка места может перевести книгу на правила 2). */
export const PhotoSaved = z.object({ photo: Photo, layoutRev: z.number().int() }).register(schemas, { id: "PhotoSaved" });

/** Распознанная диктовка: текст вставляет в ответ само приложение (автосохранение — questionSave). */
export const DictationResult = z.object({ text: z.string() }).register(schemas, { id: "DictationResult" });

export const Saved = z.object({ ok: z.literal(true), updatedAt: iso }).register(schemas, { id: "Saved" });

const BookParams = z.object({ bookId: uuid });

export const booksRoutes = {
  themesList: route({ method: "GET", path: "/api/v1/themes", auth: "none", tag: "books", summary: "Виды книг для мастера создания (язык — ?locale=ru|kk)", query: z.object({ locale: Locale.optional() }), response: ThemeList }),
  bookCreate: route({ method: "POST", path: "/api/v1/books", auth: "user", tag: "books", summary: "Новая книга (мастер создания)", body: CreateBookBody, response: CreatedBook }),
  booksList: route({ method: "GET", path: "/api/v1/books", auth: "user", tag: "books", summary: "Мои книги с прогрессом", response: BookList }),
  bookEditor: route({ method: "GET", path: "/api/v1/books/{bookId}/editor", auth: "user", tag: "books", summary: "Книга для редактора: главы, вопросы с ответами, фото", params: BookParams, response: BookEditor }),
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
  photoUpload: route({
    method: "POST",
    path: "/api/v1/books/{bookId}/photos",
    auth: "user",
    tag: "books",
    summary: "Загрузка фото книги (multipart, поле files; JPEG, PNG, HEIC, WebP); лимит — maxPhotos из bookEditor",
    params: BookParams,
    files: { field: "files" },
    response: PhotoUploadResult,
  }),
  photoUpdate: route({
    method: "PATCH",
    path: "/api/v1/books/{bookId}/photos/{photoId}",
    auth: "user",
    tag: "books",
    summary: "Правка фото: подпись, раскладка, место (к ответу или в альбом), кадр",
    params: z.object({ bookId: uuid, photoId: uuid }),
    body: PhotoPatch,
    response: PhotoSaved,
  }),
  answerDictate: route({
    method: "POST",
    path: "/api/v1/books/{bookId}/dictation",
    auth: "user",
    tag: "books",
    summary: "Голос → текст для ответа: запись (multipart, поле audio; m4a/aac/ogg/webm/mp3, до 10 минут) на языке книги",
    params: BookParams,
    files: { field: "audio" },
    response: DictationResult,
  }),
  photoDelete: route({ method: "DELETE", path: "/api/v1/books/{bookId}/photos/{photoId}", auth: "user", tag: "books", summary: "Удалить фото", params: z.object({ bookId: uuid, photoId: uuid }), response: Ok }),
} as const satisfies Record<string, RouteDef>;
