/** Книги: сама книга, вопросы с ответами, фото и письма близких (модуль authoring). */
import { boolean, index, integer, jsonb, pgTable, smallint, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { Locale } from "@/i18n/config";
import { timestamps } from "./columns";
import { users } from "./identity";

export type Gender = "m" | "f";

export interface InlinePhotoStyle {
  /** Ширина в процентах от ширины текста (25–100). */
  width: number;
  align: "left" | "center" | "right";
  /** После какого абзаца стоит фото: -1 — перед текстом, null — в конце. */
  anchor: number | null;
  aspect: "original" | "1:1" | "4:3" | "3:4" | "16:9";
  /** Точка фокуса для кадрирования, 0–1. */
  focusX: number;
  focusY: number;
  frame: "none" | "line" | "polaroid" | "round";
  /** На всю страницу: история прерывается, снимок — отдельной страницей под обрез, текст продолжается после него. */
  page?: boolean;
  /** На всю страницу целиком, без обрезки: вписать в лист (по другой стороне — поля); нет — заполнить лист. */
  pageFit?: "contain";
}

/**
 * Видео или музыка к ответу — в книге печатается QR-кодом с подписью (lib/book/answer-media.ts):
 * пожелание близких, записанное на видео, любимая песня, кюй. В электронной версии код ещё и ссылка.
 */
export interface AnswerMedia {
  /** Ключ в списке ответа (создаётся в редакторе). */
  id: string;
  kind: "video" | "music";
  /** Ссылка, которую кодирует QR (уже приведённая: youtu.be/… для YouTube). */
  url: string;
  /** Подпись в книге: «Пожелание от бабушки», «Кюй „Адай“». */
  title: string;
  /** После какого абзаца стоит карточка: -1 — перед текстом, null — в конце (как у фото в ответе). */
  anchor: number | null;
}

export const books = pgTable(
  "books",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Тема и вид книги (lib/content/kinds): love | mom | dad | friend | teacher — подарки, autobiography, blank — своя книга. */
    theme: text("theme").notNull(),
    status: text("status", { enum: ["draft", "ordered"] }).notNull().default("draft"),
    title: text("title").notNull().default(""),
    subtitle: text("subtitle").notNull().default(""),
    authorName: text("author_name").notNull().default(""),
    authorGender: text("author_gender").$type<Gender>().notNull().default("f"),
    /** Автобиография: кто записал со слов рассказчика («внучка Аружан») — печатается на обороте титула. */
    recordedBy: text("recorded_by").notNull().default(""),
    recipientName: text("recipient_name").notNull().default(""),
    recipientGender: text("recipient_gender").$type<Gender>().notNull().default("m"),
    /** Своя строка имён на обложке (порядок, «мен», что угодно); пусто — «Автор & Получатель» (lib/book/cover-names). */
    namesOnCover: text("names_on_cover").notNull().default(""),
    hideRecipientOnCover: boolean("hide_recipient_on_cover").notNull().default(false),
    coverTemplate: text("cover_template").notNull().default("linen"),
    coverPhotoId: uuid("cover_photo_id"),
    /** Остальные снимки обложек на несколько фото (коллаж, мозаика, плёнка) — по порядку мест; первое — coverPhotoId. */
    coverPhotoExtra: jsonb("cover_photo_extra").$type<string[]>().notNull().default([]),
    backText: text("back_text").notNull().default(""),
    /** Вариант задней стороны — src/lib/book/cover-back.ts. */
    backLayout: text("back_layout").notNull().default("quote"),
    /** Фото для варианта «Фото» на задней стороне. */
    backPhotoId: uuid("back_photo_id"),
    /** Остальные снимки для оборота «Полароиды»; первый — backPhotoId. */
    backPhotoExtra: jsonb("back_photo_extra").$type<string[]>().notNull().default([]),
    /** Кадры фото на обложке: масштаб и положение по местам («cover:0», «back:1») — см. lib/book/photo-frame. */
    photoFrames: jsonb("photo_frames").$type<Record<string, { zoom: number; x: number; y: number }>>().notNull().default({}),
    dedication: text("dedication").notNull().default(""),
    /** Оформление страниц — id из src/lib/book/interiors. */
    interior: text("interior").notNull().default("classic"),
    /** Настройки дизайнера страниц поверх стиля (шрифты, кегли, интервалы, цвета, элементы, главы) — src/lib/book/interiors/style.ts. */
    interiorStyle: jsonb("interior_style").$type<Record<string, unknown>>().notNull().default({}),
    /** Обложка из слоёв (текст, фото, фигуры, декор) поверх шаблона; null — обложка шаблона — src/lib/book/cover-design. */
    coverDesign: jsonb("cover_design").$type<Record<string, unknown> | null>(),
    format: text("format").notNull().default("a5"),
    /** Фото, не вставленные в истории: между главами, отдельным разделом в конце или не печатать (none). */
    photoPlacement: text("photo_placement", { enum: ["chapters", "end", "none"] }).notNull().default("chapters"),
    showToc: boolean("show_toc").notNull().default(true),
    /** Оглавление: по главам, по заголовкам разделов или главы с разделами — src/lib/book/toc.ts. */
    tocMode: text("toc_mode", { enum: ["chapters", "sections", "both"] }).notNull().default("chapters"),
    /** Свои названия и скрытые строки оглавления по ключу строки (`c:<глава>`, `q:<раздел>`) — src/lib/book/toc.ts. */
    tocLines: jsonb("toc_lines").$type<Record<string, { title?: string; hidden?: boolean; epigraph?: string; noOpenerPhoto?: boolean }>>().notNull().default({}),
    /**
     * Правила раскладки фото (src/lib/book/layout.ts): 1 — прежние, 2 — у каждого фото одно место (фото главы выбирает
     * автор, снимки обложки внутрь сами не идут). Меняется только переводом книги (authoring/application/layout-rev2.ts).
     */
    layoutRev: smallint("layout_rev").notNull().default(1),
    /** Токен публичной ссылки для писем от близких; null — приём писем выключен. */
    inviteToken: text("invite_token"),
    /** Язык книги: вопросы, заголовки глав и служебные страницы PDF (ru | kk). */
    language: text("language").$type<Locale>().notNull().default("ru"),
    /** Повод подарка (см. lib/occasions) и дата, к которой нужна книга. */
    occasion: text("occasion"),
    occasionDate: text("occasion_date"), // YYYY-MM-DD
    ...timestamps,
  },
  (t) => [index("books_user_idx").on(t.userId), uniqueIndex("books_invite_token_idx").on(t.inviteToken)],
);

export type Book = typeof books.$inferSelect;

export const bookQuestions = pgTable(
  "book_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    chapter: text("chapter").notNull(),
    /** Ключ вопроса из банка вопросов; "custom" — собственный вопрос пользователя. */
    questionKey: text("question_key"),
    /**
     * Шаблоны копируются в книгу при создании, поэтому банк вопросов можно менять,
     * не ломая уже начатые книги. Синтаксис рода: {он|она} — автор, [он|она] — адресат.
     */
    prompt: text("prompt").notNull(),
    title: text("title").notNull(),
    hint: text("hint"),
    /** Заголовок, отредактированный пользователем; null — берётся шаблон title. */
    displayText: text("display_text"),
    hideHeading: boolean("hide_heading").notNull().default(false),
    /** «С новой страницы»: история в книге начинается с новой полосы. */
    pageBreak: boolean("page_break").notNull().default(false),
    answer: text("answer").notNull().default(""),
    /** QR-коды к видео и музыке в ответе — по порядку. */
    media: jsonb("media").$type<AnswerMedia[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [index("book_questions_book_idx").on(t.bookId, t.position)],
);

export type BookQuestion = typeof bookQuestions.$inferSelect;

/**
 * Главы своей книги (тема blank): название, эпиграф и порядок. У книг с банком вопросов строк здесь нет — названия
 * глав берутся из темы. Не jsonb в books: BookRepository.save пишет снимок книги целиком и затёр бы переименование.
 * key — uuid (без «:», не «__letters»/«__gallery»): на него ссылается book_questions.chapter.
 */
export const bookChapters = pgTable(
  "book_chapters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    position: integer("position").notNull(),
    title: text("title").notNull().default(""),
    epigraph: text("epigraph").notNull().default(""),
    ...timestamps,
  },
  (t) => [uniqueIndex("book_chapters_book_key_idx").on(t.bookId, t.key), index("book_chapters_book_idx").on(t.bookId, t.position)],
);

export type BookChapter = typeof bookChapters.$inferSelect;

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    storageKey: text("storage_key").notNull(),
    thumbKey: text("thumb_key").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    caption: text("caption").notNull().default(""),
    layout: text("layout", { enum: ["full", "bleed", "half", "grid"] }).notNull().default("full"),
    /** Фото, вставленное прямо в ответ на вопрос (печатается сразу после текста ответа). */
    questionId: uuid("question_id").references(() => bookQuestions.id, { onDelete: "set null" }),
    /** Оформление фото внутри ответа: размер, выравнивание, место в тексте, кадр, рамка. */
    inline: jsonb("inline").$type<InlinePhotoStyle>(),
    /** Кадр, выбранный автором: точка и приближение (lib/book/photo-crop); null — по правилу места. */
    crop: jsonb("crop").$type<{ x: number; y: number; zoom: number }>(),
    /** Глава, которую автор выбрал для фото вне историй (ключ главы); null — раскладка по правилу книги. */
    chapter: text("chapter"),
    /** Снимок начала этой главы (в оформлениях, где глава открывается фото). */
    opener: boolean("opener").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("photos_book_idx").on(t.bookId, t.position)],
);

export type Photo = typeof photos.$inferSelect;

export const bookLetters = pgTable(
  "book_letters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    authorName: text("author_name").notNull(),
    relation: text("relation").notNull().default(""),
    text: text("text").notNull(),
    status: text("status", { enum: ["pending", "approved", "hidden"] }).notNull().default("pending"),
    ...timestamps,
  },
  (t) => [index("book_letters_book_idx").on(t.bookId)],
);

export type BookLetter = typeof bookLetters.$inferSelect;
