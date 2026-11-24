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

// ─── Книга (штаб) ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Ссылка экрана: путь сайта (/books/<id>/questions?s=<раздел>, /orders/<id>, …) — приложение открывает свой экран. */
export const HubLink = z.object({ href: z.string(), label: z.string() }).register(schemas, { id: "HubLink" });

/** Карточка «Следующий шаг»: вопрос (засечками), обложка, заказ или состояние заказа. */
export const HubCard = z
  .object({
    eyebrow: z.string(),
    title: z.string(),
    text: z.string().nullable(),
    /** Заголовок — текст вопроса книги (засечками, ссылка на раздел). */
    serif: z.boolean(),
    primary: HubLink,
    /** Значок пера у главной кнопки («Ответить»). */
    primaryWrite: z.boolean(),
    secondary: HubLink.nullable(),
    /** «Ещё N вопросов без ответа. Продолжить писать». */
    moreText: z.string().nullable(),
    more: HubLink.nullable(),
  })
  .register(schemas, { id: "HubCard" });

export const HubDeadline = z
  .object({
    days: z.number().int(),
    daysShort: z.string(),
    tone: z.enum(["calm", "warm", "hot"]),
    headline: z.string(),
    line: z.string(),
    /** clock — обычный срок, zap — срочная печать, null — электронная книга. */
    icon: z.string().nullable(),
    changeLabel: z.string(),
  })
  .register(schemas, { id: "HubDeadline" });

/** Шаг пути книги: done | partial | todo | attention; fraction — заполнение кольца; bar — полоса у «Написать». */
export const HubStep = z
  .object({
    key: z.string(),
    href: z.string(),
    title: z.string(),
    value: z.string(),
    action: z.string(),
    status: z.string(),
    fraction: z.number(),
    bar: z.number().int().nullable(),
    active: z.boolean(),
  })
  .register(schemas, { id: "HubStep" });

export const HubNeed = z.object({ level: z.enum(["error", "warning"]), text: z.string(), href: z.string().nullable() }).register(schemas, { id: "HubNeed" });

export const HubChapter = z
  .object({
    key: z.string(),
    title: z.string(),
    /** «4/6» или «разделов пока нет». */
    label: z.string(),
    done: z.boolean(),
    percent: z.number().int(),
    /** Раздел, который открывает глава: первый без ответа, иначе первый. */
    sectionId: z.string().nullable(),
  })
  .register(schemas, { id: "HubChapter" });

export const CabinetBook = z
  .object({
    id: uuid,
    title: z.string(),
    subtitle: z.string(),
    kind: z.string(),
    language: z.string(),
    blank: z.boolean(),
    editable: z.boolean(),
    coverUrl: z.string(),
    coverThumbUrl: z.string(),
    card: HubCard.nullable(),
    deadline: HubDeadline.nullable(),
    pathTitle: z.string(),
    steps: z.array(HubStep),
    needsTitle: z.string(),
    needsFix: z.string(),
    needs: z.array(HubNeed),
    chaptersTitle: z.string(),
    chaptersAside: z.string().nullable(),
    allChaptersLabel: z.string(),
    chapters: z.array(HubChapter),
    letters: z.object({ title: z.string(), text: z.string(), action: z.string(), href: z.string() }),
    help: z.object({ title: z.string(), text: z.string(), url: z.string() }),
    /** Редактор: «С чего начать?» и подсказки (свои у своей книги и «о себе»), заметка о записи с голоса. */
    whereToStart: z.string(),
    tips: z.array(z.string()),
    tipsNote: z.string().nullable(),
  })
  .register(schemas, { id: "CabinetBook" });

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
  cabinetBook: {
    method: "GET",
    path: "/api/v1/cabinet/books/{bookId}",
    auth: "user",
    tag: "cabinet",
    summary: "Штаб книги — как страница книги на сайте: следующий шаг, срок, путь, замечания, главы, письма",
    params: z.object({ bookId: uuid }),
    response: CabinetBook,
  },
} as const satisfies Record<string, RouteDef>;
