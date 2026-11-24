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

// ─── Фото книги (вкладка «Фото») ──────────────────────────────────────────────────────────────────────────────────

export const CabPhotoPlace = z
  .object({
    /** answer | opener | after | album | off */
    kind: z.string(),
    /** «В ответе «…»», «После главы «…» · само», «Альбом в конце», «Не печатается». */
    label: z.string(),
    auto: z.boolean(),
    /** cover | back — снимок виден на обложке или обороте. */
    onCover: z.string().nullable(),
    /** Отмеченный пункт листа «Где стоит фото»: answer | opener | after | album | auto | off. */
    option: z.string(),
  })
  .register(schemas, { id: "CabPhotoPlace" });

export const CabPhoto = z
  .object({
    id: uuid,
    n: z.number().int(),
    width: z.number().int(),
    height: z.number().int(),
    caption: z.string(),
    /** full | bleed | half | grid */
    layout: z.string(),
    thumbUrl: z.string(),
    url: z.string(),
    place: CabPhotoPlace,
    questionId: z.string().nullable(),
    chapter: z.string().nullable(),
    /** «Обрежется 12%» — у фото с заметной обрезкой на месте; null — без обрезки. */
    loss: z.string().nullable(),
  })
  .register(schemas, { id: "CabPhoto" });

export const CabLabeled = z.object({ key: z.string(), label: z.string(), hint: z.string().nullable(), count: z.number().int().nullable() }).register(schemas, { id: "CabLabeled" });

export const CabinetPhotos = z
  .object({
    editable: z.boolean(),
    blank: z.boolean(),
    maxPhotos: z.number().int(),
    title: z.string(),
    intro: z.string(),
    addLabel: z.string(),
    /** Итоги: «Фото», «Размещено вами», «Встали сами», «Не печатаются» — подпись и число. */
    summary: z.array(CabLabeled),
    /** Фильтры над сеткой (видимые): ключ, подпись, сколько фото. */
    filters: z.array(CabLabeled),
    ruleTitle: z.string(),
    ruleName: z.string(),
    ruleChange: z.string(),
    noMatch: z.string(),
    photos: z.array(CabPhoto),
    chapters: z.array(z.object({ key: z.string(), title: z.string() })),
    answers: z.array(z.object({ id: z.string(), title: z.string(), chapterKey: z.string() })),
    /** Лист «Где стоит фото»: пункты мест, шаги выбора главы и ответа, вид на странице, подпись, удаление. */
    sheet: z.object({
      title: z.string(),
      options: z.array(CabLabeled),
      stepChapter: z.string(),
      stepAnswer: z.string(),
      here: z.string(),
      layoutTitle: z.string(),
      layouts: z.array(CabLabeled),
      caption: z.string(),
      done: z.string(),
      coverNote: z.string(),
      backNote: z.string(),
      deleteLabel: z.string(),
      deleteTitle: z.string(),
      deleteText: z.string(),
      deleteConfirm: z.string(),
      deleteKeep: z.string(),
      cancel: z.string(),
    }),
  })
  .register(schemas, { id: "CabinetPhotos" });

// ─── Помощник по книге ────────────────────────────────────────────────────────────────────────────────────────────

export const HelpMessage = z.object({ id: z.string(), from: z.enum(["client", "bot", "manager"]), at: z.string(), text: z.string(), place: z.string() }).register(schemas, { id: "HelpMessage" });

export const CabinetHelp = z
  .object({
    enabled: z.boolean(),
    /** Ссылка WhatsApp магазина — «Написать в WhatsApp», когда помощник выключен или для своего вопроса. */
    whatsapp: z.string(),
    messages: z.array(HelpMessage),
    /** Вопросы-подсказки пустого чата: по состоянию книги и частые по разделу. */
    hints: z.array(z.string()),
    /** Подписи виджета (на языке пользователя). */
    labels: z.object({
      button: z.string(),
      title: z.string(),
      subtitle: z.string(),
      hello: z.string(),
      faqTitle: z.string(),
      placeholder: z.string(),
      typing: z.string(),
      bot: z.string(),
      manager: z.string(),
      notHelped: z.string(),
      callHuman: z.string(),
      handoff: z.string(),
      whatsapp: z.string(),
      disclaimer: z.string(),
      off: z.string(),
      error: z.string(),
    }),
  })
  .register(schemas, { id: "CabinetHelp" });

export const HelpAskBody = z
  .object({
    text: z.string().trim().max(1000),
    /** «Позвать менеджера» — без модели. */
    human: z.boolean(),
  })
  .register(schemas, { id: "HelpAskBody" });

export const HelpAnswer = z
  .object({
    /** answered | handoff | manager */
    outcome: z.string(),
    suggestions: z.array(z.string()),
    messages: z.array(HelpMessage),
  })
  .register(schemas, { id: "HelpAnswer" });

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
  cabinetPhotos: {
    method: "GET",
    path: "/api/v1/cabinet/books/{bookId}/photos",
    auth: "user",
    tag: "cabinet",
    summary: "Вкладка «Фото» — как на сайте: где стоит каждое фото, итоги, фильтры, правило книги, лист «Где стоит фото»",
    params: z.object({ bookId: uuid }),
    response: CabinetPhotos,
  },
  cabinetHelp: {
    method: "GET",
    path: "/api/v1/cabinet/books/{bookId}/help",
    auth: "user",
    tag: "cabinet",
    summary: "Помощник по книге: беседа, подсказки пустого чата, подписи виджета; section — раздел кабинета для частых вопросов",
    params: z.object({ bookId: uuid }),
    query: z.object({ section: z.string().max(20).optional() }),
    response: CabinetHelp,
  },
  cabinetHelpAsk: {
    method: "POST",
    path: "/api/v1/cabinet/books/{bookId}/help",
    auth: "user",
    tag: "cabinet",
    summary: "Вопрос помощнику по книге (или «Позвать менеджера»): ответ и беседа целиком",
    params: z.object({ bookId: uuid }),
    body: HelpAskBody,
    response: HelpAnswer,
  },
} as const satisfies Record<string, RouteDef>;
