/**
 * Страницы и оболочка редактора книги в API v1 (ADR 0012, A5 — Раздел 2A, section: "book"):
 * серверные read-модели для оболочки, штаба, навигации, вопросов, фото, писем, обложки, страниц и превью.
 */
import { z } from "zod";
import { iso, route, schemas, uuid, type RouteDef } from "./core";
import { WebDealAgreement, WebLocale } from "./web-cabinet";

const Gender = z.enum(["m", "f"]);
const BookKindSchema = z.enum(["gift", "autobiography", "blank"]);
const BookStatusSchema = z.enum(["draft", "ordered"]);
const PhotoPlacementSchema = z.enum(["chapters", "end", "none"]);
const TocModeSchema = z.enum(["chapters", "sections", "both"]);
const ChapterStartSchema = z.enum(["page", "inline", "none"]);
const PhotoLayoutSchema = z.enum(["full", "bleed", "half", "grid"]);
const StepKeySchema = z.enum(["questions", "photos", "pages", "cover", "preview", "order"]);
const StepStatusSchema = z.enum(["done", "partial", "todo", "attention"]);
const BadgeToneSchema = z.enum(["warning", "success", "info", "accent", "neutral", "danger"]);
const CoverSideSchema = z.enum(["cover", "back"]);
const LetterStatusSchema = z.enum(["pending", "approved", "hidden"]);
const BackLayoutSchema = z.enum(["quote", "letter", "photo", "fullPhoto", "polaroids", "minimal"]);

export const WebPhotoFrame = z
  .object({
    zoom: z.number(),
    x: z.number(),
    y: z.number(),
  })
  .register(schemas, { id: "WebPhotoFrame" });

export const WebPhotoCrop = z
  .object({
    x: z.number(),
    y: z.number(),
    zoom: z.number(),
  })
  .register(schemas, { id: "WebPhotoCrop" });

export const WebTocLineSetting = z
  .object({
    title: z.string().optional(),
    hidden: z.boolean().optional(),
    epigraph: z.string().optional(),
    noOpenerPhoto: z.boolean().optional(),
  })
  .register(schemas, { id: "WebTocLineSetting" });

export const WebInlinePhotoStyle = z
  .object({
    width: z.number(),
    align: z.enum(["left", "center", "right"]),
    anchor: z.number().int().nullable(),
    aspect: z.enum(["original", "1:1", "4:3", "3:4", "16:9"]),
    focusX: z.number(),
    focusY: z.number(),
    frame: z.enum(["none", "line", "polaroid", "round"]),
    page: z.boolean().optional(),
    pageFit: z.enum(["contain"]).optional(),
    keepSize: z.boolean().optional(),
    spaceAbove: z.number().optional(),
    breakBefore: z.boolean().optional(),
  })
  .register(schemas, { id: "WebInlinePhotoStyle" });

export const WebAnswerMedia = z
  .object({
    id: z.string(),
    kind: z.enum(["video", "music", "audio"]),
    url: z.string(),
    fileId: z.string().optional(),
    title: z.string(),
    anchor: z.number().int().nullable(),
  })
  .register(schemas, { id: "WebAnswerMedia" });

export const WebPhotoPlace = z
  .object({
    kind: z.enum(["answer", "opener", "after", "album", "off"]),
    chapterKey: z.string().optional(),
    questionId: z.string().optional(),
    auto: z.boolean(),
    waitingFor: z.string().optional(),
    onCover: CoverSideSchema.nullable(),
  })
  .register(schemas, { id: "WebPhotoPlace" });

export const WebPhotoPlaceEntry = z
  .object({
    id: z.string(),
    place: WebPhotoPlace,
  })
  .register(schemas, { id: "WebPhotoPlaceEntry" });

// ─── Базовая запись книги (getAccessibleBook) ───────────────────────────────────────────────────────────────

export const WebBookRow = z
  .object({
    id: uuid,
    userId: uuid,
    theme: z.string(),
    status: BookStatusSchema,
    title: z.string(),
    subtitle: z.string(),
    authorName: z.string(),
    authorGender: Gender,
    recordedBy: z.string(),
    recipientName: z.string(),
    recipientGender: Gender,
    namesOnCover: z.string(),
    hideRecipientOnCover: z.boolean(),
    coverLines: z.boolean(),
    coverTemplate: z.string(),
    coverPhotoId: uuid.nullable(),
    coverPhotoExtra: z.array(z.string()),
    backText: z.string(),
    backLayout: z.string(),
    backPhotoId: uuid.nullable(),
    backPhotoExtra: z.array(z.string()),
    photoFrames: z.record(z.string(), WebPhotoFrame),
    dedication: z.string(),
    interior: z.string(),
    interiorStyle: z.record(z.string(), z.unknown()),
    coverDesign: z.record(z.string(), z.unknown()).nullable(),
    coverBack: z.record(z.string(), z.unknown()).nullable(),
    format: z.string(),
    photoPlacement: PhotoPlacementSchema,
    showToc: z.boolean(),
    tocMode: TocModeSchema,
    tocLines: z.record(z.string(), WebTocLineSetting),
    layoutRev: z.number().int(),
    paginationRev: z.number().int(),
    inviteToken: z.string().nullable(),
    inviteText: z.string(),
    endText: z.string().nullable(),
    chapterStart: ChapterStartSchema,
    titlePage: z.boolean(),
    language: WebLocale,
    occasion: z.string().nullable(),
    occasionDate: z.string().nullable(),
    createdAt: iso,
    updatedAt: iso,
  })
  .register(schemas, { id: "WebBookRow" });

export const WebBookResponse = z
  .object({
    book: WebBookRow,
  })
  .register(schemas, { id: "WebBookResponse" });

// ─── Навигация и оболочка (layout.tsx, nav-data.ts) ─────────────────────────────────────────────────────────

export const WebBookNavOrder = z
  .object({
    id: uuid,
    number: z.number().int(),
    status: z.string(),
    plan: z.string(),
  })
  .register(schemas, { id: "WebBookNavOrder" });

export const WebBookNavStep = z
  .object({
    key: StepKeySchema,
    status: StepStatusSchema,
    fraction: z.number(),
  })
  .register(schemas, { id: "WebBookNavStep" });

export const WebBookNavLetters = z
  .object({
    approved: z.number().int(),
    pending: z.number().int(),
  })
  .register(schemas, { id: "WebBookNavLetters" });

export const WebBookNav = z
  .object({
    kind: BookKindSchema,
    answered: z.number().int(),
    total: z.number().int(),
    words: z.number().int(),
    photos: z.number().int(),
    letters: WebBookNavLetters,
    coverReady: z.boolean(),
    ordered: z.boolean(),
    paid: z.boolean(),
    order: WebBookNavOrder.nullable(),
    steps: z.array(WebBookNavStep),
    textDone: z.boolean(),
    ready: z.boolean(),
    current: StepKeySchema.nullable(),
  })
  .register(schemas, { id: "WebBookNav" });

export const WebBookOrderState = z
  .object({
    label: z.string(),
    tone: BadgeToneSchema,
  })
  .register(schemas, { id: "WebBookOrderState" });

export const WebBookNavResponse = z
  .object({
    nav: WebBookNav,
    orderState: WebBookOrderState.nullable(),
  })
  .register(schemas, { id: "WebBookNavResponse" });

// ─── Штаб книги (book-hub.ts, books/[id]/page.tsx) ─────────────────────────────────────────────────────────

export const WebBookHubStats = z
  .object({
    answered: z.number().int(),
    total: z.number().int(),
    words: z.number().int(),
    photos: z.number().int(),
    estimatedPages: z.number().int(),
    printedPages: z.number().int(),
    emptyChapters: z.number().int(),
  })
  .register(schemas, { id: "WebBookHubStats" });

export const WebBookHubPhoto = z
  .object({
    id: uuid,
    width: z.number().int(),
    height: z.number().int(),
  })
  .register(schemas, { id: "WebBookHubPhoto" });

export const WebBookHubChapter = z
  .object({
    key: z.string(),
    title: z.string(),
    total: z.number().int(),
    answered: z.number().int(),
    firstId: z.string().nullable(),
    firstOpenId: z.string().nullable(),
  })
  .register(schemas, { id: "WebBookHubChapter" });

export const WebBookHubStepRow = z
  .object({
    key: z.string(),
    href: z.string(),
    title: z.string(),
    value: z.string(),
    action: z.string(),
    bar: z.number().int().optional(),
    status: StepStatusSchema,
    fraction: z.number(),
    active: z.boolean(),
  })
  .register(schemas, { id: "WebBookHubStepRow" });

export const WebBookHubCardPrimary = z
  .object({
    href: z.string(),
    label: z.string(),
    icon: z.boolean().optional(),
  })
  .register(schemas, { id: "WebBookHubCardPrimary" });

export const WebBookHubCardSecondary = z
  .object({
    href: z.string(),
    label: z.string(),
  })
  .register(schemas, { id: "WebBookHubCardSecondary" });

export const WebBookHubCardMore = z
  .object({
    href: z.string(),
    label: z.string(),
    text: z.string(),
  })
  .register(schemas, { id: "WebBookHubCardMore" });

export const WebBookHubCard = z
  .object({
    eyebrow: z.string(),
    title: z.string(),
    text: z.string().optional(),
    serif: z.boolean().optional(),
    lang: z.string().optional(),
    primary: WebBookHubCardPrimary,
    secondary: WebBookHubCardSecondary.optional(),
    more: WebBookHubCardMore.optional(),
  })
  .register(schemas, { id: "WebBookHubCard" });

export const WebBookReadinessIssue = z
  .object({
    level: z.enum(["error", "warning"]),
    text: z.string(),
    href: z.string().optional(),
  })
  .register(schemas, { id: "WebBookReadinessIssue" });

export const WebBookHubDeadline = z
  .object({
    days: z.number().int(),
    daysShort: z.string(),
    tone: z.enum(["calm", "warm", "hot"]),
    headline: z.string(),
    line: z.string(),
    icon: z.enum(["clock", "zap"]).nullable(),
    changeLabel: z.string(),
  })
  .register(schemas, { id: "WebBookHubDeadline" });

export const WebBookHubLetters = z
  .object({
    href: z.string(),
    title: z.string(),
    text: z.string(),
    action: z.string(),
  })
  .register(schemas, { id: "WebBookHubLetters" });

export const WebBookHubPreview = z
  .object({
    href: z.string(),
    tab: z.string(),
    cta: z.string(),
  })
  .register(schemas, { id: "WebBookHubPreview" });

export const WebBookHubResponse = z
  .object({
    stats: WebBookHubStats,
    photos: z.array(WebBookHubPhoto),
    printedPages: z.number().int(),
    agreement: WebDealAgreement.nullable(),
    letterStats: WebBookNavLetters,
    letters: WebBookHubLetters,
    kind: BookKindSchema,
    blank: z.boolean(),
    editable: z.boolean(),
    percent: z.number().int(),
    chapters: z.array(WebBookHubChapter),
    nav: WebBookNav,
    rows: z.array(WebBookHubStepRow),
    card: WebBookHubCard.nullable(),
    needs: z.array(WebBookReadinessIssue),
    hasErrors: z.boolean(),
    deadline: WebBookHubDeadline.nullable(),
    preview: WebBookHubPreview,
  })
  .register(schemas, { id: "WebBookHubResponse" });

// ─── Страница вопросов и ответов (questions/page.tsx) ───────────────────────────────────────────────────────

export const WebCoverPhotos = z
  .object({
    front: z.array(z.string()),
    back: z.array(z.string()),
  })
  .register(schemas, { id: "WebCoverPhotos" });

export const WebEditorBook = z
  .object({
    id: uuid,
    format: z.string(),
    interior: z.string(),
    interiorStyle: z.record(z.string(), z.unknown()).optional(),
    dedication: z.string(),
    showToc: z.boolean(),
    tocMode: TocModeSchema.optional(),
    tocLines: z.record(z.string(), WebTocLineSetting).optional(),
    photoPlacement: PhotoPlacementSchema,
    title: z.string(),
    language: WebLocale,
    names: z.array(z.string()).optional(),
    theme: z.string(),
    kind: BookKindSchema,
    authorGender: Gender,
    recipientGender: Gender,
    layoutRev: z.number().int().optional(),
    paginationRev: z.number().int().optional(),
    chapterStart: ChapterStartSchema.optional(),
    titlePage: z.boolean().optional(),
    coverPhotoId: uuid.nullable().optional(),
    coverPhotoExtra: z.array(z.string()).optional(),
    backPhotoId: uuid.nullable().optional(),
    backPhotoExtra: z.array(z.string()).optional(),
    coverPhotos: WebCoverPhotos.optional(),
  })
  .register(schemas, { id: "WebEditorBook" });

export const WebEditorQuestion = z
  .object({
    id: uuid,
    chapter: z.string(),
    chapterTitle: z.string(),
    prompt: z.string(),
    hint: z.string().nullable(),
    defaultTitle: z.string(),
    displayText: z.string().nullable(),
    hideHeading: z.boolean(),
    answer: z.string(),
    media: z.array(WebAnswerMedia),
    isCustom: z.boolean(),
    pageBreak: z.boolean().optional(),
  })
  .register(schemas, { id: "WebEditorQuestion" });

export const WebEditorChapter = z
  .object({
    key: z.string(),
    title: z.string(),
    epigraph: z.string(),
    own: z.boolean(),
  })
  .register(schemas, { id: "WebEditorChapter" });

export const WebEditorPhoto = z
  .object({
    id: uuid,
    width: z.number().int(),
    height: z.number().int(),
    caption: z.string(),
    layout: PhotoLayoutSchema,
    questionId: uuid.nullable(),
    inline: WebInlinePhotoStyle.nullable().optional(),
    crop: WebPhotoCrop.nullable(),
    chapter: z.string().nullable(),
    opener: z.boolean(),
    onCover: CoverSideSchema.nullable(),
    rev: z.number().int().optional(),
  })
  .register(schemas, { id: "WebEditorPhoto" });

export const WebBookLetterBrief = z
  .object({
    id: uuid,
    authorName: z.string(),
    relation: z.string(),
    text: z.string(),
  })
  .register(schemas, { id: "WebBookLetterBrief" });

export const WebBookQuestionsPage = z
  .object({
    epigraphs: z.record(z.string(), z.string()),
    book: WebEditorBook,
    proofreadAi: z.boolean(),
    writerAi: z.boolean(),
    initialQuestions: z.array(WebEditorQuestion),
    chapters: z.array(WebEditorChapter),
    initialPhotos: z.array(WebEditorPhoto),
    maxPhotos: z.number().int(),
    letters: z.array(WebBookLetterBrief),
    editable: z.boolean(),
  })
  .register(schemas, { id: "WebBookQuestionsPage" });

// ─── Страница фото (photos/page.tsx, photos/photos-data.ts) ─────────────────────────────────────────────────

export const WebPlaceBook = z
  .object({
    id: uuid,
    interior: z.string(),
    format: z.string(),
    language: WebLocale,
    blank: z.boolean(),
    photoPlacement: PhotoPlacementSchema,
    galleryTitle: z.string(),
    editable: z.boolean(),
    layoutRev: z.number().int().optional(),
  })
  .register(schemas, { id: "WebPlaceBook" });

export const WebTabPhoto = z
  .object({
    id: uuid,
    width: z.number().int(),
    height: z.number().int(),
    caption: z.string(),
    layout: PhotoLayoutSchema,
    questionId: uuid.nullable(),
    chapter: z.string().nullable(),
    opener: z.boolean(),
    crop: WebPhotoCrop.nullable(),
    version: z.string().optional(),
    edited: z.boolean().optional(),
  })
  .register(schemas, { id: "WebTabPhoto" });

export const WebPlaceChapter = z
  .object({
    key: z.string(),
    title: z.string(),
    number: z.number().int().nullable().optional(),
    epigraph: z.string().optional(),
    printed: z.boolean(),
  })
  .register(schemas, { id: "WebPlaceChapter" });

export const WebPlaceAnswer = z
  .object({
    id: uuid,
    title: z.string(),
    chapterKey: z.string(),
  })
  .register(schemas, { id: "WebPlaceAnswer" });

export const WebBookPhotosPage = z
  .object({
    book: WebPlaceBook,
    photos: z.array(WebTabPhoto),
    places: z.array(WebPhotoPlaceEntry),
    chapters: z.array(WebPlaceChapter),
    answers: z.array(WebPlaceAnswer),
    tocLines: z.record(z.string(), WebTocLineSetting),
    losses: z.record(z.string(), z.number()),
    maxPhotos: z.number().int(),
  })
  .register(schemas, { id: "WebBookPhotosPage" });

// ─── Страница писем близких (letters/page.tsx) ──────────────────────────────────────────────────────────────

export const WebBookLetterItem = z
  .object({
    id: uuid,
    authorName: z.string(),
    relation: z.string(),
    text: z.string(),
    status: LetterStatusSchema,
    createdAt: iso,
  })
  .register(schemas, { id: "WebBookLetterItem" });

export const WebBookLettersPage = z
  .object({
    letters: z.array(WebBookLetterItem),
  })
  .register(schemas, { id: "WebBookLettersPage" });

// ─── Общие схемы разворота (SpreadSample — для cover и pages) ───────────────────────────────────────────────

export const WebSpreadChapter = z
  .object({
    number: z.number().int(),
    title: z.string(),
    epigraph: z.string().optional(),
  })
  .register(schemas, { id: "WebSpreadChapter" });

export const WebSpreadEntryPhoto = z
  .object({
    id: z.string(),
    url: z.string(),
    width: z.number().int(),
    height: z.number().int(),
    caption: z.string(),
    inline: WebInlinePhotoStyle.nullable().optional(),
  })
  .register(schemas, { id: "WebSpreadEntryPhoto" });

export const WebSpreadEntry = z
  .object({
    heading: z.string().nullable(),
    paragraphs: z.array(z.string()),
    breaks: z.array(z.number().int()).optional(),
    photos: z.array(WebSpreadEntryPhoto).optional(),
    media: z.array(WebAnswerMedia).optional(),
    pageBreak: z.boolean().optional(),
    continued: z.boolean().optional(),
  })
  .register(schemas, { id: "WebSpreadEntry" });

export const WebSampleTocLine = z
  .object({
    key: z.string().optional(),
    title: z.string(),
    number: z.number().int().nullable(),
    level: z.number().int().optional(),
    page: z.number().int(),
  })
  .register(schemas, { id: "WebSampleTocLine" });

export const WebSampleTocCandidate = z
  .object({
    key: z.string(),
    pageKey: z.string(),
    kind: z.enum(["chapter", "section"]),
    number: z.number().int().nullable(),
    label: z.string(),
    parent: z.string().optional(),
    folded: z.boolean().optional(),
    first: z.boolean().optional(),
    epigraph: z.string().optional(),
    page: z.number().int(),
  })
  .register(schemas, { id: "WebSampleTocCandidate" });

export const WebSpreadPhoto = z
  .object({
    url: z.string(),
    width: z.number().int(),
    height: z.number().int(),
    caption: z.string(),
  })
  .register(schemas, { id: "WebSpreadPhoto" });

export const WebSpreadOpener = z
  .object({
    url: z.string(),
    crop: WebPhotoCrop.optional(),
  })
  .register(schemas, { id: "WebSpreadOpener" });

export const WebSpreadSample = z
  .object({
    language: WebLocale,
    title: z.string(),
    subtitle: z.string(),
    author: z.string(),
    year: z.number().int(),
    dedication: z.string(),
    dedicationPlaceholder: z.string(),
    chapter: WebSpreadChapter,
    entries: z.array(WebSpreadEntry),
    tail: z.boolean().optional(),
    folio: z.number().int().optional(),
    toc: z.array(WebSampleTocLine),
    tocAll: z.array(WebSampleTocCandidate).optional(),
    tocMode: TocModeSchema.optional(),
    tocLines: z.record(z.string(), WebTocLineSetting).optional(),
    showToc: z.boolean(),
    endText: z.string().nullable().optional(),
    titlePage: z.boolean().optional(),
    chapterStart: z.enum(["inline", "none"]).optional(),
    photos: z.array(WebSpreadPhoto).optional(),
    opener: WebSpreadOpener.nullable().optional(),
    captions: z.array(z.string()).optional(),
  })
  .register(schemas, { id: "WebSpreadSample" });

// ─── Страница обложки (cover/page.tsx) ──────────────────────────────────────────────────────────────────────

export const WebCoverPagePhoto = z
  .object({
    id: uuid,
    width: z.number().int(),
    height: z.number().int(),
    opener: z.boolean(),
  })
  .register(schemas, { id: "WebCoverPagePhoto" });

export const WebPlaceNameChapter = z
  .object({
    key: z.string(),
    title: z.string(),
  })
  .register(schemas, { id: "WebPlaceNameChapter" });

export const WebPlaceNameAnswer = z
  .object({
    id: uuid,
    title: z.string(),
  })
  .register(schemas, { id: "WebPlaceNameAnswer" });

export const WebCoverPlaceNames = z
  .object({
    chapters: z.array(WebPlaceNameChapter),
    answers: z.array(WebPlaceNameAnswer),
  })
  .register(schemas, { id: "WebCoverPlaceNames" });

export const WebBookCoverPage = z
  .object({
    defaultTitle: z.string(),
    pages: z.number().int(),
    recipientLabel: z.string(),
    sample: WebSpreadSample,
    photos: z.array(WebCoverPagePhoto),
    places: z.array(WebPhotoPlaceEntry),
    placeNames: WebCoverPlaceNames,
  })
  .register(schemas, { id: "WebBookCoverPage" });

// ─── Страница вёрстки / страниц (pages/page.tsx) ────────────────────────────────────────────────────────────

export const WebPageStory = z
  .object({
    title: z.string(),
    displayText: z.string().nullable(),
    hidden: z.boolean(),
    pageBreak: z.boolean(),
  })
  .register(schemas, { id: "WebPageStory" });

export const WebPagesSheetPhoto = z
  .object({
    id: uuid,
    width: z.number().int(),
    height: z.number().int(),
    caption: z.string(),
    layout: PhotoLayoutSchema,
    questionId: uuid.nullable(),
    chapter: z.string().nullable(),
    opener: z.boolean(),
    crop: WebPhotoCrop.nullable(),
  })
  .register(schemas, { id: "WebPagesSheetPhoto" });

export const WebPagesPhotoData = z
  .object({
    book: WebPlaceBook,
    photos: z.array(WebPagesSheetPhoto),
    places: z.array(WebPhotoPlaceEntry),
    chapters: z.array(WebPlaceChapter),
    answers: z.array(WebPlaceAnswer),
    fit: z.record(z.string(), z.array(z.string())),
    maxPhotos: z.number().int(),
  })
  .register(schemas, { id: "WebPagesPhotoData" });

export const WebBookPagesPage = z
  .object({
    sample: WebSpreadSample,
    exactPages: z.record(z.string(), z.number().int()).nullable(),
    stories: z.record(z.string(), WebPageStory),
    photos: WebPagesPhotoData,
  })
  .register(schemas, { id: "WebBookPagesPage" });

// ─── Страница превью (preview/page.tsx) ─────────────────────────────────────────────────────────────────────

export const WebFlipbookPhotoSpec = z
  .object({
    href: z.string(),
    width: z.number().int().optional(),
    height: z.number().int().optional(),
    frame: WebPhotoFrame.optional(),
  })
  .register(schemas, { id: "WebFlipbookPhotoSpec" });

export const WebFlipbookCover = z
  .object({
    template: z.string(),
    lines: z.boolean().optional(),
    format: z.string(),
    title: z.string(),
    subtitle: z.string(),
    names: z.string(),
    photos: z.array(WebFlipbookPhotoSpec.nullable()),
    design: z.record(z.string(), z.unknown()).optional(),
    back: z.record(z.string(), z.unknown()).optional(),
  })
  .register(schemas, { id: "WebFlipbookCover" });

export const WebBackPhotoDims = z
  .object({
    width: z.number().int(),
    height: z.number().int(),
  })
  .register(schemas, { id: "WebBackPhotoDims" });

export const WebBackContent = z
  .object({
    layout: BackLayoutSchema,
    text: z.string(),
    signature: z.string(),
    names: z.string(),
    year: z.number().int().nullable(),
    photos: z.array(WebBackPhotoDims),
  })
  .register(schemas, { id: "WebBackContent" });

export const WebFlipbookModel = z
  .object({
    brand: z.string(),
    back: WebBackContent,
    backPhotos: z.array(WebFlipbookPhotoSpec),
  })
  .register(schemas, { id: "WebFlipbookModel" });

export const WebFlipbookData = z
  .object({
    cover: WebFlipbookCover,
    formatId: z.string(),
    title: z.string(),
    model: WebFlipbookModel,
  })
  .register(schemas, { id: "WebFlipbookData" });

export const WebBookPreviewPage = z
  .object({
    flipbook: WebFlipbookData,
    editable: z.boolean(),
  })
  .register(schemas, { id: "WebBookPreviewPage" });

// ─── Маршруты API v1 ────────────────────────────────────────────────────────────────────────────────────────

const BookParams = z.object({ bookId: uuid });
const LocaleQuery = z.object({ locale: WebLocale.optional() });

export const webBookPagesRoutes = {
  webBook: route({
    method: "GET",
    path: "/api/v1/web/books/{bookId}",
    auth: "user",
    tag: "web-book",
    summary: "Доступная книга текущего пользователя (или сотрудника CRM) для страниц редактора",
    params: BookParams,
    response: WebBookResponse,
  }),
  webBookHub: route({
    method: "GET",
    path: "/api/v1/web/books/{bookId}/hub",
    auth: "user",
    tag: "web-book",
    summary: "Штаб книги для страницы /books/[id]: шаги пути, следующий шаг, замечания, главы, письма и срок",
    params: BookParams,
    query: LocaleQuery,
    response: WebBookHubResponse,
  }),
  webBookNav: route({
    method: "GET",
    path: "/api/v1/web/books/{bookId}/nav",
    auth: "user",
    tag: "web-book",
    summary: "Навигация и состояние шапки книги для layout.tsx и ленты разделов",
    params: BookParams,
    query: LocaleQuery,
    response: WebBookNavResponse,
  }),
  webBookQuestionsPage: route({
    method: "GET",
    path: "/api/v1/web/books/{bookId}/pages/questions",
    auth: "user",
    tag: "web-book",
    summary: "Данные страницы редактора вопросов и ответов (/books/[id]/questions)",
    params: BookParams,
    response: WebBookQuestionsPage,
  }),
  webBookPhotosPage: route({
    method: "GET",
    path: "/api/v1/web/books/{bookId}/pages/photos",
    auth: "user",
    tag: "web-book",
    summary: "Данные вкладки «Фото» (/books/[id]/photos): места фото, обрезка, главы, ответы и лимит",
    params: BookParams,
    query: LocaleQuery,
    response: WebBookPhotosPage,
  }),
  webBookLettersPage: route({
    method: "GET",
    path: "/api/v1/web/books/{bookId}/pages/letters",
    auth: "user",
    tag: "web-book",
    summary: "Список писем близких для страницы /books/[id]/letters",
    params: BookParams,
    response: WebBookLettersPage,
  }),
  webBookCoverPage: route({
    method: "GET",
    path: "/api/v1/web/books/{bookId}/pages/cover",
    auth: "user",
    tag: "web-book",
    summary: "Данные редактора обложки (/books/[id]/cover): разворот-образец, фото, места, подписи и объём",
    params: BookParams,
    query: LocaleQuery,
    response: WebBookCoverPage,
  }),
  webBookPagesPage: route({
    method: "GET",
    path: "/api/v1/web/books/{bookId}/pages/pages",
    auth: "user",
    tag: "web-book",
    summary: "Данные редактора страниц и оформления (/books/[id]/pages): разворот, оглавление, истории и фото глав",
    params: BookParams,
    query: LocaleQuery,
    response: WebBookPagesPage,
  }),
  webBookPreviewPage: route({
    method: "GET",
    path: "/api/v1/web/books/{bookId}/pages/preview",
    auth: "user",
    tag: "web-book",
    summary: "Данные страницы 3D-превью книги (/books/[id]/preview): переплёт flipbook и право правки",
    params: BookParams,
    response: WebBookPreviewPage,
  }),
} as const satisfies Record<string, RouteDef>;
