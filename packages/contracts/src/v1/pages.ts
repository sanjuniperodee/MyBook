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
    /** Настройки дизайнера целиком (JSON) — для «Отменить» и ИИ-дизайнера: приложение возвращает их как есть. */
    styleJson: z.string(),
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
      history: z.object({ undo: z.string(), redo: z.string() }),
      tabs: z.object({
        content: z.string(),
        styles: z.string(),
        fonts: z.string(),
        text: z.string(),
        elements: z.string(),
        colors: z.string(),
        chapters: z.string(),
        ai: z.string(),
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
        endModes: z.array(
          z.object({
            id: z.enum(["default", "custom", "none"]),
            label: z.string(),
          }),
        ),
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
    /** Настройки дизайнера целиком (JSON) — «Отменить» и оформление от ИИ-дизайнера. */
    styleJson: z.string().max(60_000),
  })
  .partial()
  .strict()
  .register(schemas, { id: "PagesPatch" });

// ─── Студия оформления: «Текст», «Элементы», «Цвета», «Главы», шрифты по ролям ────────────────────────────────
// Вкладки студии сайта (pages/studio/*.tsx) описаны сервером как данные: разделы и элементы управления с подписями,
// пределами, текущими значениями и картинками вариантов. Приложение рисует их одинаково и шлёт правки операциями —
// своих списков, чисел и подписей у него нет.

/** Правка: куда (стиль, глава, книга, шрифт роли) и что — значение JSON-строкой; null — «как в стиле» (снять свою). */
export const PagesStudioOp = z
  .object({
    target: z.enum(["style", "chapter", "book", "fontRole"]),
    section: z.string().max(20).nullable(),
    key: z.string().max(30).nullable(),
    json: z.string().max(2000).nullable(),
  })
  .register(schemas, { id: "PagesStudioOp" });

export const PagesStudioOption = z
  .object({
    id: z.string(),
    label: z.string(),
    /** Что отправить при выборе (JSON); null — снять свою настройку. */
    json: z.string().nullable(),
    /** Рисунок варианта (орнамент, разделитель) в цветах книги. */
    svg: z.string().nullable(),
    /** Цвета палитры — кружками. */
    swatches: z.array(z.string()).nullable(),
  })
  .register(schemas, { id: "PagesStudioOption" });

export const PagesStudioControl = z
  .object({
    kind: z.enum([
      "number",
      "choice",
      "tiles",
      "toggle",
      "text",
      "color",
      "font",
      "note",
      "warning",
    ]),
    id: z.string(),
    label: z.string().nullable(),
    hint: z.string().nullable(),
    /** Какой разворот показать после правки. */
    spread: z.string().nullable(),
    target: z.enum(["style", "chapter", "book", "fontRole"]).nullable(),
    section: z.string().nullable(),
    key: z.string().nullable(),
    /** Своя настройка — есть «вернуть как в стиле». */
    custom: z.boolean(),
    value: z.number().nullable(),
    min: z.number().nullable(),
    max: z.number().nullable(),
    step: z.number().nullable(),
    /** Показ: значение × scale (доли → проценты). */
    scale: z.number().nullable(),
    unit: z.string().nullable(),
    slider: z.boolean().nullable(),
    /** Это значение — «как без настройки»: выбрали его — настройка снимается. */
    unsetAt: z.number().nullable(),
    selected: z.string().nullable(),
    options: z.array(PagesStudioOption).nullable(),
    checked: z.boolean().nullable(),
    /** Что отправить для «вкл» и «выкл» (JSON); null — снять. */
    onJson: z.string().nullable(),
    offJson: z.string().nullable(),
    text: z.string().nullable(),
    placeholder: z.string().nullable(),
    maxLength: z.number().int().nullable(),
    color: z.string().nullable(),
    swatches: z.array(z.string()).nullable(),
    /** Можно «без цвета»: подпись и что отправить (JSON «null» — явно без, null — снять). */
    noneLabel: z.string().nullable(),
    noneJson: z.string().nullable(),
    /** Выбор шрифта: только шрифты для длинного текста. */
    bodyOnly: z.boolean().nullable(),
  })
  .register(schemas, { id: "PagesStudioControl" });

export const PagesStudioFont = z
  .object({
    id: z.string(),
    name: z.string(),
    category: z.string(),
    body: z.boolean(),
    weights: z.array(z.number().int()),
    italic: z.boolean(),
    url: z.string(),
  })
  .register(schemas, { id: "PagesStudioFont" });

export const PagesStudio = z
  .object({
    tab: z.string(),
    sections: z.array(
      z.object({
        title: z.string().nullable(),
        text: z.string().nullable(),
        controls: z.array(PagesStudioControl),
        /** Снять всё своё у раздела (глава — «как у всей книги»). */
        reset: PagesStudioOp.nullable(),
        resetLabel: z.string().nullable(),
      }),
    ),
    /** Вкладка «Главы»: какие главы есть, у каких своё оформление, какая выбрана. */
    chapters: z
      .array(
        z.object({ key: z.string(), label: z.string(), styled: z.boolean() }),
      )
      .nullable(),
    chapter: z.string().nullable(),
    /** Шрифты реестра — для выбора шрифта роли. */
    fonts: z.array(PagesStudioFont).nullable(),
    fontCategories: z
      .array(z.object({ id: z.string(), label: z.string() }))
      .nullable(),
    labels: z.object({
      reset: z.string(),
      search: z.string(),
      empty: z.string(),
    }),
  })
  .register(schemas, { id: "PagesStudio" });

export const PagesStudioBody = z
  .object({
    tab: z.enum(["text", "elements", "colors", "chapters", "fonts"]),
    chapter: z.string().max(90).nullable(),
    ops: z.array(PagesStudioOp).min(1).max(10),
  })
  .strict()
  .register(schemas, { id: "PagesStudioBody" });

export const PagesStudioResult = z
  .object({ view: PagesView, studio: PagesStudio })
  .register(schemas, { id: "PagesStudioResult" });

const StudioQuery = z.object({
  tab: z.enum(["text", "elements", "colors", "chapters", "fonts"]),
  chapter: z.string().max(90).optional(),
});

// ─── ИИ-дизайнер страниц (как DesignAiPanel сайта, target pages) ──────────────────────────────────────────────

export const PagesAiPatch = z
  .object({ interior: z.string(), styleJson: z.string() })
  .register(schemas, { id: "PagesAiPatch" });

/** Остаток запросов и все надписи панели — с сервера (design.ai); пакеты в приложении не продаются. */
export const PagesAiInfo = z
  .object({
    remaining: z.number().int(),
    limit: z.number().int(),
    credits: z.number().int(),
    /** Бесплатные и купленные кончились. */
    out: z.boolean(),
    ideas: z.object({
      edit: z.array(z.string()),
      create: z.array(z.string()),
      variants: z.array(z.string()),
      review: z.array(z.string()),
    }),
    labels: z.object({
      title: z.string(),
      lead: z.string(),
      modes: z.array(
        z.object({
          id: z.enum(["edit", "create", "variants", "review"]),
          label: z.string(),
          hint: z.string(),
          placeholder: z.string(),
          send: z.string(),
          thinking: z.string(),
        }),
      ),
      examplesLabel: z.string(),
      left: z.string(),
      credits: z.string().nullable(),
      notice: z.string().nullable(),
      freeNote: z.string(),
      outTitle: z.string(),
      outText: z.string(),
      perks: z.array(z.string()),
      concept: z.string(),
      undo: z.string(),
      noChange: z.string(),
      ai: z.string(),
      variantsTitle: z.string(),
      pick: z.string(),
      picked: z.string(),
      noVariants: z.string(),
      scoreLabel: z.string(),
      strengths: z.string(),
      tips: z.string(),
      apply: z.string(),
      applied: z.string(),
      createDefault: z.string(),
      variantsDefault: z.string(),
    }),
  })
  .register(schemas, { id: "PagesAiInfo" });

export const PagesAiBody = z
  .object({
    mode: z.enum(["edit", "create", "variants", "review"]),
    prompt: z.string().trim().max(500),
    history: z
      .array(
        z.object({ prompt: z.string().max(500), reply: z.string().max(600) }),
      )
      .max(4),
  })
  .strict()
  .register(schemas, { id: "PagesAiBody" });

export const PagesAiAnswer = z
  .object({
    mode: z.enum(["edit", "create", "variants", "review"]),
    reply: z.string(),
    concept: z.string().nullable(),
    changed: z.boolean().nullable(),
    /** Оформление правки — уже сохранено в книге; было — для «Вернуть как было». */
    patch: PagesAiPatch.nullable(),
    before: PagesAiPatch,
    variants: z
      .array(
        z.object({
          name: z.string(),
          idea: z.string(),
          patch: PagesAiPatch,
          imageUrl: z.string(),
        }),
      )
      .nullable(),
    score: z.number().int().nullable(),
    scoreText: z.string().nullable(),
    summary: z.string().nullable(),
    strengths: z.array(z.string()).nullable(),
    tips: z
      .array(
        z.object({
          title: z.string(),
          why: z.string(),
          patch: PagesAiPatch.nullable(),
        }),
      )
      .nullable(),
    info: PagesAiInfo,
  })
  .register(schemas, { id: "PagesAiAnswer" });

// ─── «Главы книги» (ChaptersEditor сайта): название, эпиграф, убрать или вернуть, порядок; режим оглавления ──────

export const PagesChapterRow = z
  .object({
    /** Ключ строки оглавления (c:<глава>) — для правки названия, эпиграфа, «убрать». */
    key: z.string(),
    /** Ключ главы — для перестановки. */
    pageKey: z.string(),
    /** Название по умолчанию (подсказка в поле). */
    label: z.string(),
    title: z.string(),
    epigraph: z.string(),
    epigraphPlaceholder: z.string(),
    removed: z.boolean(),
    number: z.number().int().nullable(),
    meta: z.string(),
    /** Первую главу убрать нельзя. */
    first: z.boolean(),
    /** Можно переставлять; up/down — есть куда. */
    movable: z.boolean(),
    canUp: z.boolean(),
    canDown: z.boolean(),
  })
  .register(schemas, { id: "PagesChapterRow" });

export const PagesChapters = z
  .object({
    editable: z.boolean(),
    /** Своя книга: главы называет автор в редакторе — здесь только подсказка. */
    blank: z.boolean(),
    rows: z.array(PagesChapterRow),
    tocMode: z.string(),
    tocModes: z.array(
      z.object({ id: z.string(), title: z.string(), text: z.string() }),
    ),
    limits: z.object({ title: z.number().int(), epigraph: z.number().int() }),
    labels: z.object({
      title: z.string(),
      text: z.string(),
      later: z.string(),
      removedCount: z.string().nullable(),
      nameReset: z.string(),
      epigraphReset: z.string(),
      remove: z.string(),
      restore: z.string(),
      removed: z.string(),
      toStart: z.string(),
      up: z.string(),
      down: z.string(),
      toEnd: z.string(),
      moveError: z.string(),
      toc: z.string(),
    }),
  })
  .register(schemas, { id: "PagesChapters" });

/** Правка «Глав книги»: строка главы (название, эпиграф, убрать), перестановка или режим оглавления. */
export const PagesChaptersBody = z
  .object({
    key: z.string().max(90).optional(),
    title: z.string().max(200).optional(),
    epigraph: z.string().max(400).optional(),
    hidden: z.boolean().optional(),
    move: z.enum(["start", "up", "down", "end"]).optional(),
    tocMode: z.enum(["chapters", "sections", "both"]).optional(),
  })
  .strict()
  .register(schemas, { id: "PagesChaptersBody" });

export const PagesChaptersResult = z
  .object({ view: PagesView, chapters: PagesChapters })
  .register(schemas, { id: "PagesChaptersResult" });

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
  pagesStudioGet: route({
    method: "GET",
    path: "/api/v1/books/{bookId}/pages/studio",
    auth: "user",
    tag: "pages",
    summary:
      "Вкладка студии оформления страниц как данные: разделы, элементы управления, значения",
    params: BookParams,
    query: StudioQuery,
    response: PagesStudio,
  }),
  pagesStudioApply: route({
    method: "POST",
    path: "/api/v1/books/{bookId}/pages/studio",
    auth: "user",
    tag: "pages",
    summary:
      "Правки студии (операции): стиль, оформление главы, настройки книги, шрифт роли",
    params: BookParams,
    body: PagesStudioBody,
    response: PagesStudioResult,
  }),
  pagesAiInfo: route({
    method: "GET",
    path: "/api/v1/books/{bookId}/pages/ai",
    auth: "user",
    tag: "pages",
    summary: "ИИ-дизайнер страниц: остаток запросов, режимы, идеи и надписи",
    params: BookParams,
    response: PagesAiInfo,
  }),
  pagesAi: route({
    method: "POST",
    path: "/api/v1/books/{bookId}/pages/ai",
    auth: "user",
    tag: "pages",
    summary:
      "Просьба к ИИ-дизайнеру страниц: правка и «с нуля» сохраняются сразу, варианты и советы — с картинками и оформлением",
    params: BookParams,
    body: PagesAiBody,
    response: PagesAiAnswer,
  }),
  pagesChapters: route({
    method: "GET",
    path: "/api/v1/books/{bookId}/pages/chapters",
    auth: "user",
    tag: "pages",
    summary:
      "«Главы книги»: названия, эпиграфы, убранные главы, порядок и режим оглавления",
    params: BookParams,
    response: PagesChapters,
  }),
  pagesChaptersUpdate: route({
    method: "POST",
    path: "/api/v1/books/{bookId}/pages/chapters",
    auth: "user",
    tag: "pages",
    summary:
      "Правка «Глав книги»: название, эпиграф, убрать/вернуть, перестановка, режим оглавления",
    params: BookParams,
    body: PagesChaptersBody,
    response: PagesChaptersResult,
  }),
} as const satisfies Record<string, RouteDef>;
