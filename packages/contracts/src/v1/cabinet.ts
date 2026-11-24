/**
 * Кабинет автора для приложения «MyBooks» (API v1, ADR 0012): экраны приложения — те же, что кабинет сайта, поэтому
 * сервер отдаёт уже собранную модель экрана (числа, подписи на языке пользователя, адреса картинок) из той же функции,
 * что рисует страницу сайта (src/server/shelf.ts и т. д.), — приложение не повторяет логику и не расходится с сайтом.
 */
import { z } from "zod";
import { schemas, type RouteDef } from "./core";

const uuid = z.uuid();

/** Тон плашки: срок к празднику (calm/warm/hot), статус заказа (success/warning/info/danger/neutral). */
export const ShelfDeadline = z.object({ text: z.string(), tone: z.enum(["calm", "warm", "hot"]) }).register(schemas, { id: "ShelfDeadline" });

export const ShelfOrder = z
  .object({
    id: uuid,
    number: z.number().int(),
    /** «Заказ №12». */
    label: z.string(),
    status: z.string(),
    statusLabel: z.string(),
    tone: z.string(),
  })
  .register(schemas, { id: "ShelfOrder" });

export const ShelfItem = z
  .object({
    id: uuid,
    title: z.string(),
    subtitle: z.string(),
    /** Название темы: «Любимому человеку». */
    kind: z.string(),
    /** Своя книга: прогресс по объёму, а не по вопросам. */
    blank: z.boolean(),
    ordered: z.boolean(),
    /** Готовность 0–100 и подпись: «Написано 4 из 176 вопросов». */
    progress: z.number().int(),
    progressLabel: z.string(),
    /** «71 слово · 1 фото» (у своей книги — только фото). */
    counts: z.string(),
    /** «Изменена 24 ноября 2026 г.» */
    updated: z.string(),
    deadline: ShelfDeadline.nullable(),
    order: ShelfOrder.nullable(),
    /** Начат ли текст: «Продолжить писать» или «Начать писать». */
    started: z.boolean(),
    /** Следующий раздел без ответа — «Продолжить писать» открывает его; null — начало редактора. */
    writeSectionId: z.string().nullable(),
    /** Картинка лицевой крышки (относительный адрес, версия в адресе): крупная и миниатюра. */
    coverUrl: z.string(),
    coverThumbUrl: z.string(),
  })
  .register(schemas, { id: "ShelfItem" });

export const CabinetShelf = z.object({ books: z.array(ShelfItem) }).register(schemas, { id: "CabinetShelf" });

// ─── Маршруты ─────────────────────────────────────────────────────────────────────────────────────────────────────

export const cabinetRoutes = {
  cabinetShelf: {
    method: "GET",
    path: "/api/v1/cabinet/shelf",
    auth: "user",
    tag: "cabinet",
    summary: "Полка «Мои книги» — как на сайте: книги в работе первыми, прогресс, срок к празднику, заказ, обложка",
    response: CabinetShelf,
  },
} as const satisfies Record<string, RouteDef>;
