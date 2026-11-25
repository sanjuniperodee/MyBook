/**
 * «Страницы» книги в API v1 — вторая половина шага «Оформить» (сайт: /books/{id}/pages, PagesEditor): развороты
 * блока картинками той же вёрстки, что печать, состав книги (посвящение, оглавление, последняя страница, правило фото),
 * библиотека стилей с миниатюрами на тексте книги и готовые пары шрифтов. Подписи, каталоги и числа — с сервера.
 */
import { z } from "zod";
import { PAGES_TEXT_MAX } from "../limits";
import { route, schemas, uuid, type RouteDef } from "./core";

export { PAGES_TEXT_MAX } from "../limits";

const BookParams = z.object({ bookId: uuid });

/** Разворот сцены — как SpreadKind сайта (строкой: зарегистрированный enum генератор Dart делает пустым классом). */
export const PagesSpreadKind = z.enum(["chapter", "photos", "front", "toc"]);

/** Разворот на сцене: адрес картинки без ширины — приложение добавляет &w= из imageWidths. */
export const PagesSpread = z
  .object({ kind: PagesSpreadKind, label: z.string(), imageUrl: z.string() })
  .register(schemas, { id: "PagesSpread" });

/** Начертание для подписи в своём шрифте: файл шрифта (TTF) по адресу сайта. */
export const PagesFontFace = z
  .object({
    family: z.string(),
    weight: z.number().int(),
    italic: z.boolean(),
    url: z.string(),
  })
  .register(schemas, { id: "PagesFontFace" });

export const PagesState = z
  .object({
    interior: z.string(),
    dedication: z.string(),
    showToc: z.boolean(),
    /** null — «Продолжение следует…», пусто — без фразы. */
    endText: z.string().nullable(),
    titlePage: z.boolean(),
    photoPlacement: z.enum(["chapters", "end", "none"]),
    /** Своих настроек дизайнера поверх стиля (кроме глав): при смене стиля они сбрасываются. */
    customCount: z.number().int(),
  })
  .register(schemas, { id: "PagesState" });

export const PagesStyle = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    direction: z.string(),
    directionLabel: z.string(),
    /** В пару к обложке книги. */
    forCover: z.boolean(),
    /** Фото в начале главы: «Фото в начале главы · форма»; нет — null. */
    openerPhoto: z.string().nullable(),
    /** Заголовок крупного просмотра: «Стиль «…»». */
    previewTitle: z.string(),
    /** Миниатюра (разворот «Глава» на тексте книги в этом стиле); &w= добавляет приложение. */
    imageUrl: z.string(),
  })
  .register(schemas, { id: "PagesStyle" });

export const PagesFontPair = z
  .object({
    id: z.string(),
    name: z.string(),
    display: PagesFontFace,
    body: PagesFontFace,
    upper: z.boolean(),
    /** Разрядка крупной надписи, em. */
    tracking: z.number(),
    active: z.boolean(),
  })
  .register(schemas, { id: "PagesFontPair" });

export const PagesView = z
  .object({
    bookId: uuid,
    editable: z.boolean(),
    state: PagesState,
    /** Ширины картинок разворотов: меньшая — миниатюры, большая — сцена. */
    imageWidths: z.array(z.number().int()),
    /** Пропорция разворота (ширина / высота) — сцена держит место до картинки. */
    spreadAspect: z.number(),
    spreads: z.array(PagesSpread),
    limits: z.object({
      dedication: z.number().int(),
      endText: z.number().int(),
    }),
    styles: z.object({
      items: z.array(PagesStyle),
      filters: z.array(z.object({ id: z.string(), label: z.string() })),
      /** Сколько стилей во «Всех» до кнопки «Показать все». */
      shown: z.number().int(),
    }),
    fonts: z.object({ sample: z.string(), pairs: z.array(PagesFontPair) }),
    labels: z.object({
      designSwitch: z.object({ cover: z.string(), pages: z.string() }),
      tabs: z.object({
        content: z.string(),
        styles: z.string(),
        fonts: z.string(),
      }),
      content: z.object({
        start: z.string(),
        front: z.string(),
        frontSet: z.string(),
        frontEmpty: z.string(),
        dedication: z.string(),
        dedicationText: z.string(),
        dedicationPlaceholder: z.string(),
        toc: z.string(),
        tocOn: z.string(),
        tocOff: z.string(),
        tocLabel: z.string(),
        tocApprox: z.string(),
        endTitle: z.string(),
        endModes: z.array(z.object({ id: z.enum(["default", "custom", "none"]), label: z.string() })),
        endLabel: z.string(),
        endPlaceholder: z.string(),
        endHint: z.string(),
        endNoneHint: z.string(),
        /** Своя фраза начинается с этой (как на сайте). */
        endDefault: z.string(),
        photos: z.string(),
        photosSummary: z.string(),
        photosLink: z.string(),
      }),
      styles: z.object({
        inBook: z.string(),
        pairBadge: z.string(),
        open: z.string(),
        apply: z.string(),
        current: z.string(),
        previewText: z.string(),
        showAll: z.string(),
        empty: z.string(),
        search: z.string(),
        /** «Свои настройки шрифтов и интервалов сброшены» — после смены стиля. */
        reset: z.string(),
      }),
      fonts: z.object({ pairs: z.string(), pairsText: z.string() }),
    }),
  })
  .register(schemas, { id: "PagesView" });

/**
 * Правка страниц (только изменённые поля). interior — сменить стиль (свои настройки дизайнера, кроме глав, сбрасываются,
 * как на сайте); fontPair — применить готовую пару шрифтов.
 */
export const PagesPatch = z
  .object({
    interior: z.string().max(40),
    fontPair: z.string().max(20),
    dedication: z.string().trim().max(PAGES_TEXT_MAX.dedication),
    showToc: z.boolean(),
    endText: z.string().trim().max(PAGES_TEXT_MAX.endText).nullable(),
    titlePage: z.boolean(),
  })
  .partial()
  .strict()
  .register(schemas, { id: "PagesPatch" });

export type PagesView = z.infer<typeof PagesView>;
export type PagesPatch = z.infer<typeof PagesPatch>;

export const pagesRoutes = {
  pagesGet: route({
    method: "GET",
    path: "/api/v1/books/{bookId}/pages",
    auth: "user",
    tag: "pages",
    summary:
      "Страницы книги: развороты картинками, состав книги, стили и пары шрифтов",
    params: BookParams,
    response: PagesView,
  }),
  pagesUpdate: route({
    method: "PATCH",
    path: "/api/v1/books/{bookId}/pages",
    auth: "user",
    tag: "pages",
    summary:
      "Правка страниц: стиль, пара шрифтов, посвящение, оглавление, последняя страница, титул",
    params: BookParams,
    body: PagesPatch,
    response: PagesView,
  }),
} as const satisfies Record<string, RouteDef>;
