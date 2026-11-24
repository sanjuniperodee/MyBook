/**
 * Обложка книги в API v1 как данные: шаблон, линии, тексты, фото лицевой стороны и оборота, текст оборота; каталог
 * шаблонов с миниатюрами; готовая лицевая крышка картинкой. Обложка из слоёв (конструктор, ИИ-дизайнер) правится на
 * сайте — здесь только признак hasDesign. Поля — те же, что в настройках книги на сайте (CoverFields — общие).
 */
import { z } from "zod";
import { route, schemas, uuid, type RouteDef } from "./core";

/** Поля обложки в настройках книги (PATCH /api/books/{id} сайта берёт их отсюда). Каталог шаблонов проверяет домен. */
export const CoverFields = z.object({
  title: z.string().trim().max(80),
  subtitle: z.string().trim().max(80),
  hideRecipientOnCover: z.boolean(),
  namesOnCover: z.string().trim().max(120),
  coverTemplate: z.string().max(40),
  coverLines: z.boolean(),
  coverPhotoId: uuid.nullable(),
  coverPhotoExtra: z.array(uuid).max(5),
  backText: z.string().trim().max(400),
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
    /** Фото лицевой стороны по местам шаблона (длина = photoSlots шаблона; null — место пустое). */
    photoIds: z.array(uuid.nullable()),
    backText: z.string(),
    backLayout: z.string(),
    backPhotoId: uuid.nullable(),
    /** Обложка из слоёв (конструктор или ИИ-дизайнер): шаблон и тексты на ней задаёт она, правка — на сайте. */
    hasDesign: z.boolean(),
    /** Готовая лицевая крышка (WebP), путь от сайта с версией: ?w=240|480|900 подставляет клиент. */
    imageUrl: z.string(),
    /** Можно править: черновик и (для сотрудника) есть право правки. */
    editable: z.boolean(),
  })
  .register(schemas, { id: "Cover" });

export const CoverView = z.object({ cover: Cover, templates: z.array(CoverTemplate) }).register(schemas, { id: "CoverView" });

const BookParams = z.object({ bookId: uuid });

export const coverRoutes = {
  coverGet: route({ method: "GET", path: "/api/v1/books/{bookId}/cover", auth: "user", tag: "cover", summary: "Обложка книги и каталог шаблонов", params: BookParams, response: CoverView }),
  coverUpdate: route({ method: "PATCH", path: "/api/v1/books/{bookId}/cover", auth: "user", tag: "cover", summary: "Правка обложки (только изменённые поля): шаблон, линии, тексты, фото", params: BookParams, body: CoverPatch, response: CoverView }),
} as const satisfies Record<string, RouteDef>;
