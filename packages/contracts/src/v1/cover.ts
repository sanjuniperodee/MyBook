/**
 * Обложка книги в API v1 как данные: шаблон, линии, тексты, фото лицевой стороны и оборота, текст оборота; каталог
 * шаблонов с миниатюрами; готовая лицевая крышка картинкой. Обложка из слоёв (конструктор, ИИ-дизайнер) правится на
 * сайте — здесь только признак hasDesign. Поля — те же, что в настройках книги на сайте (CoverFields — общие).
 */
import { z } from "zod";
import { COVER_TEXT_MAX } from "../limits";
import { route, schemas, uuid, type RouteDef } from "./core";

/** Длины текстов обложки — одни для схемы, сайта и приложения (отдаются в CoverView.limits). */
export { COVER_TEXT_MAX } from "../limits";

/** Поля обложки в настройках книги (PATCH /api/books/{id} сайта берёт их отсюда). Каталог шаблонов проверяет домен. */
export const CoverFields = z.object({
  title: z.string().trim().max(COVER_TEXT_MAX.title),
  /** Автор; у автобиографии — рассказчик. */
  authorName: z.string().trim().max(COVER_TEXT_MAX.authorName),
  /** Автобиография: кто записал со слов рассказчика (у остальных книг домен поле пропускает). */
  recordedBy: z.string().trim().max(COVER_TEXT_MAX.recordedBy),
  recipientName: z.string().trim().max(COVER_TEXT_MAX.recipientName),
  subtitle: z.string().trim().max(COVER_TEXT_MAX.subtitle),
  hideRecipientOnCover: z.boolean(),
  namesOnCover: z.string().trim().max(COVER_TEXT_MAX.namesOnCover),
  coverTemplate: z.string().max(40),
  coverLines: z.boolean(),
  coverPhotoId: uuid.nullable(),
  coverPhotoExtra: z.array(uuid).max(5),
  backText: z.string().trim().max(COVER_TEXT_MAX.backText),
  backLayout: z.string().max(20),
  backPhotoId: uuid.nullable(),
  backPhotoExtra: z.array(uuid).max(5),
});

export const CoverPatch = CoverFields.partial().strict().register(schemas, { id: "CoverPatch" });

export const CoverTemplate = z
  .object({
    id: z.string(),
    name: z.string(),
    /** Настроение — для фильтра в выборе. */
    mood: z.string(),
    requiresPhoto: z.boolean(),
    /** Сколько фото клиента нужно (0 — без фото клиента). */
    photoSlots: z.number().int(),
    /** Миниатюра шаблона (графика без текста), путь от сайта; кэшируется навсегда. */
    previewUrl: z.string(),
  })
  .register(schemas, { id: "CoverTemplate" });

export const Cover = z
  .object({
    template: z.string(),
    lines: z.boolean(),
    title: z.string(),
    subtitle: z.string(),
    namesOnCover: z.string(),
    hideRecipientOnCover: z.boolean(),
    authorName: z.string(),
    recordedBy: z.string(),
    recipientName: z.string(),
    /** gift — подарок, autobiography — о себе (получателя нет, есть «кто записал»), blank — своя книга. */
    kind: z.enum(["gift", "autobiography", "blank"]),
    /** Подпись поля получателя по теме («Мама», «Любимый человек»…); null — у темы нет. */
    recipientLabel: z.string().nullable(),
    /** Что будет на обложке при пустом namesOnCover (по виду книги и «не показывать получателя»). */
    autoNames: z.string(),
    /** Год на обороте («Лаконично»): год праздника или текущий. */
    year: z.number().int(),
    /** Фото лицевой стороны по местам шаблона (длина = photoSlots шаблона; null — место пустое). */
    photoIds: z.array(uuid.nullable()),
    backText: z.string(),
    backLayout: z.string(),
    backPhotoId: uuid.nullable(),
    /** Обложка из слоёв (конструктор или ИИ-дизайнер): шаблон и тексты на ней задаёт она, правка — на сайте. */
    hasDesign: z.boolean(),
    /** Готовая лицевая крышка (WebP), путь от сайта с версией: ?w=240|480|900 подставляет клиент. */
    imageUrl: z.string(),
    /** Оборот картинкой (WebP), путь от сайта с версией оборота: &w=240|480|900 подставляет клиент. */
    backImageUrl: z.string(),
    /** Можно править: черновик и (для сотрудника) есть право правки. */
    editable: z.boolean(),
  })
  .register(schemas, { id: "Cover" });

export const CoverMood = z.object({ id: z.string(), label: z.string() }).register(schemas, { id: "CoverMood" });

/** Вариант оборота (lib/book/cover-back.ts): подписи, подсказка и поле текста по виду книги, сколько фото умеет показать. */
export const CoverBackLayout = z
  .object({
    id: z.string(),
    name: z.string(),
    hint: z.string(),
    /** Подпись и подсказка поля текста; null — текст не нужен («Лаконично»: note). */
    label: z.string().nullable(),
    placeholder: z.string().nullable(),
    note: z.string().nullable(),
    photos: z.number().int(),
    /** «Какое фото» / «Какие фото — до 3, в порядке выбора»; null — без фото. */
    photosLabel: z.string().nullable(),
  })
  .register(schemas, { id: "CoverBackLayout" });

/**
 * Надписи экрана обложки — сообщения сайта (books.cover, design.cover, design.ui.studio.cover), посчитанные под эту книгу
 * и выбранный шаблон: у приложения своих строк нет.
 */
export const CoverLabels = z
  .object({
    title: z.string(),
    saving: z.string(),
    sides: z.object({ front: z.string(), back: z.string() }),
    tabs: z.object({ designs: z.string(), photo: z.string(), text: z.string(), variant: z.string() }),
    variants: z.string(),
    /** Сколько обложек в выборе сразу, подпись кнопки «Показать все обложки (N)». */
    shown: z.number().int(),
    showAll: z.string(),
    onCover: z.string(),
    designActive: z.string(),
    readonly: z.string(),
    photo: z.object({ title: z.string(), slots: z.array(z.string()), slotsHint: z.string(), uploadFirst: z.string(), note: z.string() }),
    text: z.object({
      bookTitle: z.string(),
      subtitle: z.string(),
      subtitlePlaceholder: z.string(),
      author: z.string(),
      recordedBy: z.string(),
      recordedByPlaceholder: z.string(),
      recipientNone: z.string(),
      hideRecipient: z.string(),
      namesOnCover: z.string(),
      namesOnCoverText: z.string(),
      coverLines: z.string(),
      coverLinesHint: z.string(),
    }),
    back: z.object({ title: z.string(), text: z.string(), noPhotos: z.string(), signed: z.string().nullable() }),
  })
  .register(schemas, { id: "CoverLabels" });

/**
 * Обложка и выбор. Миниатюры сетки — templates[].previewUrl (графика без текста); крупный предпросмотр выбранного
 * шаблона с текущими надписями и фото — `/api/books/{id}/cover-image?template=<id>&w=…` (вёрстка печати; только для
 * выбранного — растр PDF на каждую клетку сетки слишком тяжёл).
 */
export const CoverView = z
  .object({
    cover: Cover,
    templates: z.array(CoverTemplate),
    moods: z.array(CoverMood),
    backLayouts: z.array(CoverBackLayout),
    labels: CoverLabels,
    /** Наибольшие длины полей (COVER_TEXT_MAX). */
    limits: z.object({ title: z.number().int(), authorName: z.number().int(), recordedBy: z.number().int(), recipientName: z.number().int(), subtitle: z.number().int(), namesOnCover: z.number().int(), backText: z.number().int() }),
  })
  .register(schemas, { id: "CoverView" });

const BookParams = z.object({ bookId: uuid });

export const coverRoutes = {
  coverGet: route({ method: "GET", path: "/api/v1/books/{bookId}/cover", auth: "user", tag: "cover", summary: "Обложка книги, каталог шаблонов и настроения для фильтра", params: BookParams, response: CoverView }),
  coverUpdate: route({ method: "PATCH", path: "/api/v1/books/{bookId}/cover", auth: "user", tag: "cover", summary: "Правка обложки (только изменённые поля): шаблон, линии, тексты, фото", params: BookParams, body: CoverPatch, response: CoverView }),
} as const satisfies Record<string, RouteDef>;
