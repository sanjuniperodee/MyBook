/**
 * Обложка книги в API v1 как данные: шаблон, декоративные линии, тексты, фото лицевой стороны и оборота, текст
 * оборота, кадры фото; полный конструктор обложки (лицо и оборот: слои текста, фото, фигур/рамок и декора, фон,
 * библиотека макетов, шрифты, коллекция фото, палитры, лимиты и все надписи интерфейса с сервера).
 * Поля шаблона — те же, что в настройках книги на сайте (CoverFields — общие).
 */
import { z } from "zod";
import { COVER_DESIGN_LIMITS, COVER_TEXT_MAX } from "../limits";
import { route, schemas, uuid, type RouteDef } from "./core";

/** Длины текстов обложки и пределы конструктора — одни для схемы, сайта и приложения (отдаются в CoverView). */
export { COVER_DESIGN_LIMITS, COVER_TEXT_MAX } from "../limits";

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

// ─── конструктор обложки: геометрия, фон и слои ─────────────────────────────

export const CoverRect = z
  .object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  })
  .register(schemas, { id: "CoverRect" });

export const CoverBoardSize = z
  .object({
    w: z.number(),
    h: z.number(),
  })
  .register(schemas, { id: "CoverBoardSize" });

export const CoverPhotoFrame = z
  .object({
    zoom: z.number().min(COVER_DESIGN_LIMITS.frameZoomMin).max(COVER_DESIGN_LIMITS.frameZoomMax),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  })
  .register(schemas, { id: "CoverPhotoFrame" });

export const CoverSlotFrame = z
  .object({
    /** Ключ места: cover:0, back:1 и т. п. */
    key: z.string().regex(/^(cover|back):\d{1,2}$/),
    frame: CoverPhotoFrame,
  })
  .register(schemas, { id: "CoverSlotFrame" });

export const CoverBackground = z
  .object({
    kind: z.enum(["template", "color", "gradient"]),
    color: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    angle: z.number().optional(),
  })
  .register(schemas, { id: "CoverBackground" });

export const CoverTextShadow = z
  .object({
    color: z.string(),
    x: z.number(),
    y: z.number(),
    opacity: z.number().optional(),
  })
  .register(schemas, { id: "CoverTextShadow" });

export const CoverColorWidth = z
  .object({
    color: z.string(),
    width: z.number(),
  })
  .register(schemas, { id: "CoverColorWidth" });

export const CoverColorOpacity = z
  .object({
    color: z.string(),
    opacity: z.number(),
  })
  .register(schemas, { id: "CoverColorOpacity" });

export const CoverTextPlate = z
  .object({
    color: z.string(),
    opacity: z.number(),
    radius: z.number().optional(),
    pad: z.number().optional(),
  })
  .register(schemas, { id: "CoverTextPlate" });

export const CoverShapeGradient = z
  .object({
    to: z.string(),
    angle: z.number(),
  })
  .register(schemas, { id: "CoverShapeGradient" });

export const CoverTextStyle = z
  .object({
    font: z.string(),
    weight: z.number().int(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    upper: z.boolean().optional(),
    size: z.number(),
    color: z.string(),
    tracking: z.number().optional(),
    lineHeight: z.number().optional(),
    align: z.enum(["left", "center", "right"]),
    valign: z.enum(["top", "middle", "bottom"]),
    shadow: CoverTextShadow.optional(),
    outline: CoverColorWidth.optional(),
    plate: CoverTextPlate.optional(),
  })
  .register(schemas, { id: "CoverTextStyle" });

export const CoverLayer = z
  .object({
    id: z.string().max(16),
    kind: z.enum(["text", "image", "shape", "decor"]),
    name: z.string().max(COVER_DESIGN_LIMITS.name).optional(),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    rotate: z.number().optional(),
    opacity: z.number().optional(),
    locked: z.boolean().optional(),
    hidden: z.boolean().optional(),
    // text
    bind: z.enum(["title", "subtitle", "names"]).optional(),
    text: z.string().max(COVER_DESIGN_LIMITS.text).optional(),
    style: CoverTextStyle.optional(),
    // image
    photoId: uuid.nullable().optional(),
    stock: z.string().nullable().optional(),
    frame: CoverPhotoFrame.optional(),
    mask: z.enum(["rect", "rounded", "circle", "arch"]).optional(),
    radius: z.number().optional(),
    border: CoverColorWidth.nullable().optional(),
    mono: z.boolean().optional(),
    overlay: CoverColorOpacity.nullable().optional(),
    // shape (включая декоративные линии и рамки: line, frame, double, corners, rect, ellipse, arch)
    shape: z.enum(["rect", "ellipse", "line", "frame", "double", "corners", "arch"]).optional(),
    fill: z.string().nullable().optional(),
    gradient: CoverShapeGradient.nullable().optional(),
    stroke: z.string().nullable().optional(),
    strokeWidth: z.number().optional(),
    // decor
    motif: z.string().optional(),
    color: z.string().optional(),
    accent: z.string().optional(),
    /** Свой векторный рисунок (ИИ-дизайнер) — сохраняется без потерь при правке соседних слоёв. */
    art: z.record(z.string(), z.unknown()).optional(),
    spec: z.record(z.string(), z.unknown()).optional(),
  })
  .register(schemas, { id: "CoverLayer" });

export const CoverDesign = z
  .object({
    v: z.number().int(),
    background: CoverBackground,
    layers: z.array(CoverLayer).max(COVER_DESIGN_LIMITS.layers),
  })
  .register(schemas, { id: "CoverDesign" });

export const CoverBack = z
  .object({
    v: z.number().int(),
    background: CoverBackground,
    layers: z.array(CoverLayer).max(COVER_DESIGN_LIMITS.layers).optional(),
  })
  .register(schemas, { id: "CoverBack" });

// ─── модель обложки и каталоги ──────────────────────────────────────────────

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
    /** Все выбранные фото оборота по порядку (для вариантов на несколько фото, например «Полароиды»). */
    backPhotoIds: z.array(uuid).optional(),
    /** Обложка из слоёв (конструктор или ИИ-дизайнер). */
    hasDesign: z.boolean(),
    /** Оборот собран слоями в конструкторе. */
    hasBackDesign: z.boolean().optional(),
    /** Данные конструктора лицевой стороны (null — режим шаблона). */
    coverDesign: CoverDesign.nullable().optional(),
    /** Данные оборота (свой фон и/или слои конструктора; null — как спереди и вариант оборота). */
    coverBack: CoverBack.nullable().optional(),
    /** Слои лица, повторяющиеся под слоями оборота при фоне «как спереди» (фото, фигуры и декор, без текста). */
    backUnderlay: z.array(CoverLayer).optional(),
    /** Кадры фото шаблона и оборота (cover:0, back:0…). */
    photoFrames: z.array(CoverSlotFrame).optional(),
    /** Формат книги (a5, square…). */
    format: z.string().optional(),
    /** Размер крышки (картона), мм. */
    board: CoverBoardSize.optional(),
    /** Безопасная зона лица (доли крышки; корешок слева). */
    safeFront: CoverRect.optional(),
    /** Безопасная зона оборота (доли крышки; корешок справа). */
    safeBack: CoverRect.optional(),
    /** Готовая лицевая крышка (WebP), путь от сайта с версией: ?w=240|480|900 подставляет клиент. */
    imageUrl: z.string(),
    /** Оборот картинкой (WebP), путь от сайта с версией оборота: &w=240|480|900 подставляет клиент. */
    backImageUrl: z.string(),
    /** Развёртка целиком (оборот + корешок + лицо, WebP), путь от сайта: &w=480|900 подставляет клиент. */
    spreadImageUrl: z.string().optional(),
    /** Фон лицевого шаблона без текста (SVG или WebP с фото книги) — подложка холста конструктора. */
    templateBgUrl: z.string().optional(),
    /** Фон оборота шаблона без текста — подложка холста оборота при фоне «как спереди». */
    backTemplateBgUrl: z.string().optional(),
    /** Базовый цвет фона шаблона (для контраста новых надписей в конструкторе). */
    templateBaseColor: z.string().nullable().optional(),
    /** Можно править: черновик и (для сотрудника) есть право правки. */
    editable: z.boolean(),
  })
  .register(schemas, { id: "Cover" });

export const CoverMood = z.object({ id: z.string(), label: z.string() }).register(schemas, { id: "CoverMood" });

export const CoverOption = z.object({ id: z.string(), label: z.string() }).register(schemas, { id: "CoverOption" });

export const CoverWeightOption = z.object({ weight: z.number().int(), label: z.string() }).register(schemas, { id: "CoverWeightOption" });

export const CoverFontOption = z
  .object({
    id: z.string(),
    name: z.string(),
    category: z.string(),
    weights: z.array(z.number().int()),
    italic: z.boolean(),
    body: z.boolean(),
  })
  .register(schemas, { id: "CoverFontOption" });

export const CoverShapeOption = z
  .object({
    id: z.enum(["rect", "ellipse", "line", "frame", "double", "corners", "arch"]),
    label: z.string(),
    /** Только обводка (линия, рамка, двойная рамка, уголки) — без заливки. */
    outlineOnly: z.boolean(),
    /** Поддерживает скругление углов. */
    supportsRadius: z.boolean(),
    /** Значок SVG, собранный тем же shapeElements, что на сайте. */
    svg: z.string(),
  })
  .register(schemas, { id: "CoverShapeOption" });

export const CoverDecorOption = z
  .object({
    id: z.string(),
    label: z.string(),
    aspect: z.number(),
    /** Рисунок SVG мотива (цвет #3B332E), собранный decorDrawing сайта. */
    svg: z.string(),
  })
  .register(schemas, { id: "CoverDecorOption" });

export const CoverTextPresetOption = z
  .object({
    id: z.enum(["heading", "subheading", "body", "script"]),
    label: z.string(),
    sampleText: z.string(),
    font: z.string(),
    weight: z.number().int(),
    size: z.number(),
    lineHeight: z.number(),
    tracking: z.number().optional(),
    upper: z.boolean().optional(),
    h: z.number(),
  })
  .register(schemas, { id: "CoverTextPresetOption" });

export const CoverStockPhoto = z
  .object({
    id: z.string(),
    group: z.string(),
    thumbUrl: z.string(),
    viewUrl: z.string(),
  })
  .register(schemas, { id: "CoverStockPhoto" });

export const CoverLayoutOption = z
  .object({
    id: z.string(),
    genre: z.string(),
    name: z.string(),
    description: z.string(),
    template: z.string().nullable(),
  })
  .register(schemas, { id: "CoverLayoutOption" });

export const CoverDesignerLimits = z
  .object({
    layers: z.number().int(),
    text: z.number().int(),
    name: z.number().int(),
    bleed: z.number(),
    minSize: z.number(),
    maxSize: z.number(),
    fontSizeMin: z.number(),
    fontSizeMax: z.number(),
    trackingMin: z.number(),
    trackingMax: z.number(),
    lineHeightMin: z.number(),
    lineHeightMax: z.number(),
    shadowMin: z.number(),
    shadowMax: z.number(),
    outlineMin: z.number(),
    outlineMax: z.number(),
    strokeMin: z.number(),
    strokeMax: z.number(),
    borderMin: z.number(),
    borderMax: z.number(),
    frameZoomMin: z.number(),
    frameZoomMax: z.number(),
    minDpi: z.number().int(),
    ptPerMm: z.number(),
    historyLimit: z.number().int(),
  })
  .register(schemas, { id: "CoverDesignerLimits" });

export const CoverDesignerLabels = z
  .object({
    modes: z.object({ template: z.string(), designer: z.string() }),
    views: z.object({ flat: z.string(), spread: z.string(), spreadHint: z.string() }),
    cta: z.object({ title: z.string(), text: z.string(), open: z.string(), openActive: z.string(), reset: z.string(), confirmReset: z.string() }),
    backCta: z.object({ title: z.string(), text: z.string(), open: z.string(), active: z.string(), openActive: z.string(), reset: z.string(), confirmReset: z.string(), readonly: z.string() }),
    replace: z.object({ titleTemplate: z.string(), text: z.string(), ok: z.string(), cancel: z.string() }),
    backFill: z.object({ title: z.string(), likeFront: z.string(), own: z.string(), likeFrontNote: z.string(), ownNote: z.string(), color: z.string(), frontColors: z.string(), more: z.string() }),
    frame: z.object({ title: z.string(), hint: z.string(), zoom: z.string(), reset: z.string(), slotPrefix: z.string() }),
    panels: z.object({ add: z.string(), layouts: z.string(), background: z.string(), properties: z.string(), layers: z.string(), fill: z.string() }),
    toolbar: z.object({
      undo: z.string(),
      redo: z.string(),
      duplicate: z.string(),
      remove: z.string(),
      front: z.string(),
      forward: z.string(),
      backward: z.string(),
      back: z.string(),
      lock: z.string(),
      unlock: z.string(),
      hide: z.string(),
      show: z.string(),
      safe: z.string(),
      grid: z.string(),
      alignTitle: z.string(),
      alignLeft: z.string(),
      alignCenter: z.string(),
      alignRight: z.string(),
      alignTop: z.string(),
      alignMiddle: z.string(),
      alignBottom: z.string(),
      backToTemplate: z.string(),
    }),
    add: z.object({
      text: z.string(),
      photo: z.string(),
      bookPhotos: z.string(),
      noBookPhotos: z.string(),
      upload: z.string(),
      stock: z.string(),
      shapes: z.string(),
      decor: z.string(),
      limit: z.string(),
    }),
    layers: z.object({
      empty: z.string(),
      hint: z.string(),
      rename: z.string(),
      kindText: z.string(),
      kindImage: z.string(),
      kindShape: z.string(),
      kindDecor: z.string(),
      bindTitle: z.string(),
      bindSubtitle: z.string(),
      bindNames: z.string(),
    }),
    props: z.object({
      nothing: z.string(),
      none: z.string(),
      position: z.string(),
      x: z.string(),
      y: z.string(),
      w: z.string(),
      h: z.string(),
      rotate: z.string(),
      opacity: z.string(),
      mm: z.string(),
      pt: z.string(),
      deg: z.string(),
      pct: z.string(),
      fullCover: z.string(),
      text: z.object({
        title: z.string(),
        content: z.string(),
        linkedTitle: z.string(),
        linkedSubtitle: z.string(),
        linkedNames: z.string(),
        unlink: z.string(),
        font: z.string(),
        fontSearch: z.string(),
        fontEmpty: z.string(),
        weight: z.string(),
        italic: z.string(),
        size: z.string(),
        color: z.string(),
        tracking: z.string(),
        lineHeight: z.string(),
        align: z.string(),
        valign: z.string(),
        underline: z.string(),
        upper: z.string(),
        effects: z.string(),
        shadow: z.string(),
        shadowX: z.string(),
        shadowY: z.string(),
        outline: z.string(),
        outlineWidth: z.string(),
        plate: z.string(),
        plateRadius: z.string(),
        platePad: z.string(),
        effectsNote: z.string(),
      }),
      image: z.object({
        title: z.string(),
        source: z.string(),
        crop: z.string(),
        cropDone: z.string(),
        cropHint: z.string(),
        zoom: z.string(),
        resetFrame: z.string(),
        mask: z.string(),
        radius: z.string(),
        border: z.string(),
        borderWidth: z.string(),
        mono: z.string(),
        overlay: z.string(),
        empty: z.string(),
        lowResPrefix: z.string(),
      }),
      shape: z.object({
        title: z.string(),
        kind: z.string(),
        fill: z.string(),
        gradient: z.string(),
        gradientTo: z.string(),
        angle: z.string(),
        stroke: z.string(),
        strokeWidth: z.string(),
        radius: z.string(),
      }),
      decor: z.object({
        title: z.string(),
        motif: z.string(),
        color: z.string(),
        accent: z.string(),
        artNote: z.string(),
      }),
      background: z.object({
        title: z.string(),
        titleBack: z.string(),
        likeFront: z.string(),
        color: z.string(),
        fromColor: z.string(),
        toColor: z.string(),
        angle: z.string(),
        templateNote: z.string(),
        likeFrontNote: z.string(),
      }),
    }),
    layouts: z.object({
      title: z.string(),
      text: z.string(),
      photosNote: z.string(),
      search: z.string(),
      empty: z.string(),
      apply: z.string(),
      backTitle: z.string(),
      backText: z.string(),
    }),
    canvas: z.object({
      wrap: z.string(),
      spine: z.string(),
      placeholderTitle: z.string(),
      placeholderSubtitle: z.string(),
      placeholderNames: z.string(),
      placeholderText: z.string(),
      imagePlaceholder: z.string(),
      unsafeWarning: z.string(),
      unsafeShow: z.string(),
    }),
    namesSwap: z.string(),
    namesAuto: z.string(),
    retry: z.string(),
    loadError: z.string(),
  })
  .register(schemas, { id: "CoverDesignerLabels" });

/** Полный каталог и словари конструктора обложки (всё с сервера: шрифты, макеты, фигуры, декор, сток, палитры, лимиты, надписи). */
export const CoverDesignerCatalog = z
  .object({
    swatches: z.array(z.string()),
    backSwatches: z.array(z.string()),
    fonts: z.array(CoverFontOption),
    fontCategories: z.array(CoverOption),
    weightLabels: z.array(CoverWeightOption),
    shapes: z.array(CoverShapeOption),
    decors: z.array(CoverDecorOption),
    textPresets: z.array(CoverTextPresetOption),
    imageMasks: z.array(CoverOption),
    aligns: z.array(CoverOption),
    valigns: z.array(CoverOption),
    bgKinds: z.array(CoverOption),
    stockGroups: z.array(CoverOption),
    stockPhotos: z.array(CoverStockPhoto),
    layoutGenres: z.array(CoverOption),
    layouts: z.array(CoverLayoutOption),
    limits: CoverDesignerLimits,
    labels: CoverDesignerLabels,
  })
  .register(schemas, { id: "CoverDesignerCatalog" });

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
    /** Шаг «Оформить» — две половины: «Обложка · Страницы» (заголовок экрана и есть переключатель, как на сайте). */
    designSwitch: z.object({ cover: z.string(), pages: z.string() }),
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
    /** Каталог и словари нативного конструктора обложки. */
    designer: CoverDesignerCatalog.optional(),
  })
  .register(schemas, { id: "CoverView" });

// ─── запросы конструктора обложки ───────────────────────────────────────────

/** Сохранение состояния конструктора обложки (лицо, оборот, кадры фото, привязанные тексты, линии). */
export const CoverDesignSaveBody = z
  .object({
    coverDesign: CoverDesign.nullable().optional(),
    coverBack: CoverBack.nullable().optional(),
    coverTemplate: z.string().max(40).optional(),
    coverLines: z.boolean().optional(),
    title: z.string().trim().max(COVER_TEXT_MAX.title).optional(),
    subtitle: z.string().trim().max(COVER_TEXT_MAX.subtitle).optional(),
    namesOnCover: z.string().trim().max(COVER_TEXT_MAX.namesOnCover).optional(),
    photoFrames: z.array(CoverSlotFrame).max(COVER_DESIGN_LIMITS.frameSlotsMax).optional(),
  })
  .strict()
  .register(schemas, { id: "CoverDesignSaveBody" });

/** Открыть конструктор (из текущего шаблона/варианта оборота) или применить готовый макет на сервере. */
export const CoverDesignInitBody = z
  .object({
    side: z.enum(["front", "back"]),
    /** Готовый макет лица из CoverDesignerCatalog.layouts (необязательно — без него строится из шаблона книги). */
    layoutId: z.string().max(60).optional(),
    /** Вариант оборота из backLayouts (для side=back — раскладывается слоями вместо нынешних). */
    backLayout: z.string().max(20).optional(),
  })
  .strict()
  .register(schemas, { id: "CoverDesignInitBody" });

/** Сброс конструктора обратно к шаблону/варианту оборота (или замена на другой шаблон). */
export const CoverDesignResetBody = z
  .object({
    side: z.enum(["front", "back"]),
    coverTemplate: z.string().max(40).optional(),
    coverPhotoId: uuid.nullable().optional(),
    coverPhotoExtra: z.array(uuid).max(5).optional(),
  })
  .strict()
  .register(schemas, { id: "CoverDesignResetBody" });

const BookParams = z.object({ bookId: uuid });

export const coverRoutes = {
  coverGet: route({ method: "GET", path: "/api/v1/books/{bookId}/cover", auth: "user", tag: "cover", summary: "Обложка книги, каталог шаблонов, настроения и данные конструктора", params: BookParams, response: CoverView }),
  coverUpdate: route({ method: "PATCH", path: "/api/v1/books/{bookId}/cover", auth: "user", tag: "cover", summary: "Правка обложки (только изменённые поля): шаблон, линии, тексты, фото", params: BookParams, body: CoverPatch, response: CoverView }),
  coverDesignSave: route({ method: "PUT", path: "/api/v1/books/{bookId}/cover/design", auth: "user", tag: "cover", summary: "Сохранение конструктора обложки (слои лица/оборота, фон, кадры фото, привязанные тексты)", params: BookParams, body: CoverDesignSaveBody, response: CoverView }),
  coverDesignInit: route({ method: "POST", path: "/api/v1/books/{bookId}/cover/design/init", auth: "user", tag: "cover", summary: "Сборка слоёв конструктора из шаблона, готового макета или варианта оборота", params: BookParams, body: CoverDesignInitBody, response: CoverView }),
  coverDesignReset: route({ method: "POST", path: "/api/v1/books/{bookId}/cover/design/reset", auth: "user", tag: "cover", summary: "Сброс конструктора лица к шаблону или оборота к варианту", params: BookParams, body: CoverDesignResetBody, response: CoverView }),
} as const satisfies Record<string, RouteDef>;
