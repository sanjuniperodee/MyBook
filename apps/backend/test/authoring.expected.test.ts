import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, describe, it, vi } from "vitest";
import { LOCALE_HEADER } from "@/i18n/config";
import { AuthoringError, isBookVisibleTo, type BookRow, type BookViewer, type ChapterRow, type LetterRow, type PhotoRow, type QuestionRow } from "@/modules/authoring";
import {
  AUTHORING,
  AUTHORING_ASSISTANT,
  AUTHORING_BOOK_OWNERSHIP,
  AUTHORING_ORDERING,
  AUTHORING_PHOTO_LIMIT,
  AUTHORING_PHOTO_RENDERER,
  AUTHORING_PREVIEWS,
  type AuthoringOrderBrief,
} from "../src/modules/authoring/authoring.tokens";
import { bootTestApp, sessionOf, testUser, type FakeLimiter } from "./app";

const OWNER = testUser("11111111-1111-4111-8111-111111111111", { name: "Алия", locale: "ru" });
const STRANGER = testUser("22222222-2222-4222-8222-222222222222", { name: "Марат", locale: "ru" });

const BOOK_DRAFT_ID = "aaaa1111-1111-4111-8111-111111111111";
const BOOK_ORDERED_ID = "aaaa2222-2222-4222-8222-222222222222";
const Q1_ID = "bbbb1111-1111-4111-8111-111111111111";
const Q2_ID = "bbbb2222-2222-4222-8222-222222222222";
const P1_ID = "cccc1111-1111-4111-8111-111111111111";
const P2_ID = "cccc2222-2222-4222-8222-222222222222";
const L1_ID = "dddd1111-1111-4111-8111-111111111111";
const L2_ID = "dddd2222-2222-4222-8222-222222222222";
const ORDER_PAID_ID = "eeee1111-1111-4111-8111-111111111111";

const ORIGIN = "http://localhost:3000";
const FIXED_NOW = new Date("2026-11-26T10:00:00.000Z");

function makeBook(over: Partial<BookRow> = {}): BookRow {
  return {
    id: BOOK_DRAFT_ID,
    userId: OWNER.id,
    theme: "love",
    status: "draft",
    title: "Наша история",
    subtitle: "Воспоминания",
    authorName: "Алия",
    authorGender: "f",
    recordedBy: "",
    recipientName: "Марат",
    recipientGender: "m",
    namesOnCover: "",
    hideRecipientOnCover: false,
    coverLines: true,
    coverTemplate: "linen",
    coverPhotoId: P1_ID,
    coverPhotoExtra: [],
    backText: "С любовью навсегда",
    backLayout: "quote",
    backPhotoId: null,
    backPhotoExtra: [],
    photoFrames: {},
    dedication: "Моему мужу",
    interior: "classic",
    interiorStyle: {},
    coverDesign: null,
    coverBack: null,
    format: "a5",
    photoPlacement: "chapters",
    showToc: true,
    tocMode: "chapters",
    tocLines: {},
    layoutRev: 2,
    paginationRev: 2,
    inviteToken: "inv-token-123",
    inviteText: "",
    endText: null,
    chapterStart: "page",
    titlePage: true,
    language: "ru",
    occasion: "anniversary",
    occasionDate: "2027-06-15",
    createdAt: new Date("2026-11-01T10:00:00.000Z"),
    updatedAt: new Date("2026-11-25T10:00:00.000Z"),
    ...over,
  };
}

const sampleQuestions: QuestionRow[] = [
  {
    id: Q1_ID,
    bookId: BOOK_DRAFT_ID,
    chapter: "meeting",
    questionKey: "love.meeting.1",
    position: 0,
    prompt: "Как вы познакомились?",
    hint: "Вспомните первый день",
    title: "Первая встреча",
    displayText: null,
    hideHeading: false,
    pageBreak: false,
    answer: "Мы встретились в Алматы осенним вечером и сразу разговорились на три часа.",
    media: [],
    createdAt: new Date("2026-11-01T10:00:00.000Z"),
    updatedAt: new Date("2026-11-20T10:00:00.000Z"),
  },
  {
    id: Q2_ID,
    bookId: BOOK_DRAFT_ID,
    chapter: "meeting",
    questionKey: "love.meeting.2",
    position: 1,
    prompt: "Что запомнилось больше всего?",
    hint: null,
    title: "Главный момент",
    displayText: null,
    hideHeading: false,
    pageBreak: false,
    answer: "",
    media: [],
    createdAt: new Date("2026-11-01T10:00:00.000Z"),
    updatedAt: new Date("2026-11-20T10:00:00.000Z"),
  },
];

const sampleChapters: ChapterRow[] = [];

const samplePhotos: PhotoRow[] = [
  {
    id: P1_ID,
    bookId: BOOK_DRAFT_ID,
    questionId: null,
    position: 0,
    storageKey: `photos/${BOOK_DRAFT_ID}/${P1_ID}_v1.jpg`,
    thumbKey: `photos/${BOOK_DRAFT_ID}/${P1_ID}_v1_thumb.jpg`,
    width: 1600,
    height: 1200,
    caption: "Осень в горах",
    layout: "full",
    inline: null,
    crop: null,
    chapter: "meeting",
    opener: true,
    createdAt: new Date("2026-11-05T10:00:00.000Z"),
    updatedAt: new Date("2026-11-05T10:00:00.000Z"),
  },
  {
    id: P2_ID,
    bookId: BOOK_DRAFT_ID,
    questionId: Q1_ID,
    position: 1,
    storageKey: `photos/${BOOK_DRAFT_ID}/${P2_ID}.jpg`,
    thumbKey: `photos/${BOOK_DRAFT_ID}/${P2_ID}_thumb.jpg`,
    width: 1200,
    height: 1600,
    caption: "Прогулка",
    layout: "bleed",
    inline: null,
    crop: null,
    chapter: null,
    opener: false,
    createdAt: new Date("2026-11-06T10:00:00.000Z"),
    updatedAt: new Date("2026-11-06T10:00:00.000Z"),
  },
];

const sampleLetters: LetterRow[] = [
  {
    id: L1_ID,
    bookId: BOOK_DRAFT_ID,
    authorName: "Дана",
    relation: "сестра",
    text: "Желаю вам счастья и долгих лет!",
    status: "approved",
    position: 0,
    createdAt: new Date("2026-11-10T10:00:00.000Z"),
    updatedAt: new Date("2026-11-10T10:00:00.000Z"),
  },
  {
    id: L2_ID,
    bookId: BOOK_DRAFT_ID,
    authorName: "Арман",
    relation: "друг",
    text: "Пусть каждый день радует вас!",
    status: "pending",
    position: 1,
    createdAt: new Date("2026-11-11T10:00:00.000Z"),
    updatedAt: new Date("2026-11-11T10:00:00.000Z"),
  },
];

const sampleBuild = {
  fp: "abc123fp",
  pageCount: 48,
  contentPages: 42,
  trimMm: { w: 145, h: 207 },
  pages: [
    { n: 1, kind: "front" as const, chapterKey: undefined },
    { n: 2, kind: "opener" as const, chapterKey: "meeting" },
    { n: 3, kind: "text" as const, chapterKey: "meeting" },
  ],
  chapterPages: { meeting: 2 },
  imageBase: `/api/books/${BOOK_DRAFT_ID}/pages/abc123fp`,
};

const paidOrder: AuthoringOrderBrief = { id: ORDER_PAID_ID, bookId: BOOK_ORDERED_ID, number: 501, status: "paid", plan: "classic" };

const shared = vi.hoisted(() => ({
  booksMap: new Map<string, BookRow>(),
  allowRate: true,
  books: { start: vi.fn(), updateSettings: vi.fn(), setLetterInvite: vi.fn() },
  questions: { edit: vi.fn() },
  photos: { upload: vi.fn(), update: vi.fn(), delete: vi.fn(), editState: vi.fn(), originalKey: vi.fn(), saveEdit: vi.fn(), revertEdit: vi.fn() },
  letters: { edit: vi.fn(), reorder: vi.fn(), delete: vi.fn() },
  photoFile: vi.fn(),
  previews: { current: vi.fn(), build: vi.fn(), progressOf: vi.fn() },
  assistant: {
    dictate: vi.fn(),
    proofreader: { configured: vi.fn() },
    writer: { configured: vi.fn() },
  },
  ordering: {
    queries: { userOrders: vi.fn(), lastOrderOfBook: vi.fn() },
    orders: { agreementFor: vi.fn() },
  },
  probeOriginal: vi.fn(),
  renderEdit: vi.fn(),
  photoLimit: 120,
}));

const sharedQueries = {
  book: async (id: string) => shared.booksMap.get(id) ?? null,
  visibleBook: async (id: string, viewer: BookViewer) => {
    const b = shared.booksMap.get(id);
    return b && isBookVisibleTo(b.userId, viewer) ? b : null;
  },
  userBooks: async (userId: string) =>
    [...shared.booksMap.values()]
      .filter((b) => b.userId === userId)
      .map((book) => ({ book, answered: 1, total: 2, words: 12, photos: 2 })),
  questions: async () => sampleQuestions,
  chapters: async () => sampleChapters,
  photos: async () => samplePhotos,
  editedPhotoIds: async () => new Set([P1_ID]),
  letters: async () => sampleLetters,
  approvedLetters: async () => sampleLetters.filter((l) => l.status === "approved"),
  stats: async () => ({ answered: 1, total: 2, words: 12, photos: 2, estimatedPages: 34, printedPages: 40, emptyChapters: 0 }),
  bundle: async (id: string) => {
    const book = shared.booksMap.get(id);
    return book ? { book, questions: sampleQuestions, chapters: sampleChapters, photos: samplePhotos, letters: sampleLetters.filter((l) => l.status === "approved") } : null;
  },
  photoFor: async (photoId: string) => samplePhotos.find((p) => p.id === photoId) ?? null,
};

const sharedAuthoringFacade = {
  books: shared.books,
  questions: shared.questions,
  photos: shared.photos,
  letters: shared.letters,
  queries: sharedQueries,
  photoRepository: {},
  photoFile: shared.photoFile,
};

vi.mock("next/headers", () => import("@/server/http/next-shim"));
vi.mock("next/server", () => import("@/server/http/next-shim"));
vi.mock("@/server/rateLimit", () => ({ rateLimit: async () => shared.allowRate, trustedClientIp: async () => "203.0.113.10" }));
vi.mock("@/server/photoLimit", () => ({ maxPhotos: async () => shared.photoLimit }));
vi.mock("@/server/photo-edit-render", () => ({
  probeOriginalImage: (b: Buffer) => shared.probeOriginal(b),
  renderPhotoEdit: (b: Buffer, d: unknown) => shared.renderEdit(b, d),
}));
vi.mock("@/server/auth", async () => {
  const { cookies, headers } = await import("@/server/http/next-shim");
  return {
    getCurrentUser: async () => {
      const all = [OWNER, STRANGER];
      const c = (await cookies()).get("mb_session")?.value;
      const h = (await headers()).get("authorization");
      const token = c ?? h?.replace(/^Bearer\s+/, "") ?? null;
      return token ? all.find((u) => sessionOf(u) === token) ?? null : null;
    },
  };
});
vi.mock("@/server/container", () => ({
  container: () => ({
    authoring: sharedAuthoringFacade,
    previews: shared.previews,
    assistant: shared.assistant,
    ordering: shared.ordering,
    reporting: { bookOwnership: async () => null },
  }),
}));

const { assertRoute } = await import("./expected");

function multipart(field: string, filename: string, mime: string, content: Buffer | string) {
  const boundary = "----mb-parity";
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`, "utf8");
  const body = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return { boundary, body: Buffer.concat([head, body, tail]) };
}

const asOwner = { cookie: `mb_session=${sessionOf(OWNER)}` };
const asStranger = { cookie: `mb_session=${sessionOf(STRANGER)}` };
const mutOwner = { ...asOwner, origin: ORIGIN };

let app: NestFastifyApplication;
let limiter: FakeLimiter;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXED_NOW);
  ({ app, limiter } = await bootTestApp({
    users: [OWNER, STRANGER],
    overrides: [
      [AUTHORING, sharedAuthoringFacade],
      [AUTHORING_BOOK_OWNERSHIP, { bookOwnership: async () => null }],
      [
        AUTHORING_ORDERING,
        {
          userOrders: (uid: string) => shared.ordering.queries.userOrders(uid),
          lastOrderOfBook: (bid: string) => shared.ordering.queries.lastOrderOfBook(bid),
          agreementFor: (uid: string) => shared.ordering.orders.agreementFor(uid),
        },
      ],
      [AUTHORING_PREVIEWS, shared.previews],
      [
        AUTHORING_ASSISTANT,
        {
          dictate: (inp: unknown) => shared.assistant.dictate(inp),
          proofreadConfigured: () => shared.assistant.proofreader.configured(),
          writerConfigured: () => shared.assistant.writer.configured(),
        },
      ],
      [AUTHORING_PHOTO_LIMIT, { maxPhotos: async () => shared.photoLimit }],
      [
        AUTHORING_PHOTO_RENDERER,
        {
          probeOriginal: (b: Buffer) => shared.probeOriginal(b),
          renderEdit: (b: Buffer, d: unknown) => shared.renderEdit(b, d),
        },
      ],
    ],
  }));
});

afterAll(async () => {
  vi.useRealTimers();
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(FIXED_NOW);
  limiter.hits.length = 0;
  limiter.deny = false;
  shared.allowRate = true;
  shared.photoLimit = 120;
  shared.booksMap = new Map([
    [BOOK_DRAFT_ID, makeBook()],
    [BOOK_ORDERED_ID, makeBook({ id: BOOK_ORDERED_ID, status: "ordered" })],
  ]);

  shared.books.start.mockResolvedValue({ id: BOOK_DRAFT_ID });
  shared.books.updateSettings.mockResolvedValue(undefined);
  shared.books.setLetterInvite.mockResolvedValue("inv-token-123");
  shared.questions.edit.mockResolvedValue(undefined);
  shared.photos.upload.mockResolvedValue({ created: [{ id: P1_ID }], failed: [{ name: "bad.gif", reason: "format" }], damaged: ["broken.jpg"] });
  shared.photos.update.mockResolvedValue(undefined);
  shared.photos.delete.mockResolvedValue(undefined);
  shared.photos.editState.mockResolvedValue({ edit: null, version: "v1" });
  shared.photos.originalKey.mockResolvedValue(`photos/${BOOK_DRAFT_ID}/${P1_ID}_orig.jpg`);
  shared.photos.saveEdit.mockResolvedValue(undefined);
  shared.photos.revertEdit.mockResolvedValue(undefined);
  shared.photoFile.mockResolvedValue(Buffer.from("RAW_ORIG"));
  shared.letters.edit.mockResolvedValue(undefined);
  shared.letters.reorder.mockResolvedValue(undefined);
  shared.letters.delete.mockResolvedValue(undefined);
  shared.previews.current.mockResolvedValue(sampleBuild);
  shared.previews.build.mockResolvedValue({ status: "ready", build: sampleBuild });
  shared.previews.progressOf.mockReturnValue({ state: "running", stage: "flow", percent: 42.6, etaMs: 3200.4, overrun: false, ahead: 0 });
  shared.assistant.dictate.mockResolvedValue({ text: "  Привет, мир!  ", by: "gemini" });
  shared.assistant.proofreader.configured.mockResolvedValue(true);
  shared.assistant.writer.configured.mockResolvedValue(false);
  shared.ordering.queries.userOrders.mockResolvedValue([paidOrder]);
  shared.ordering.queries.lastOrderOfBook.mockImplementation(async (bookId: string) => (bookId === BOOK_ORDERED_ID ? paidOrder : null));
  shared.ordering.orders.agreementFor.mockResolvedValue(null);
  shared.probeOriginal.mockResolvedValue({ width: 2000, height: 1500, suggestedLevels: { black: 0.02, white: 0.98, gamma: 1.05 } });
  shared.renderEdit.mockResolvedValue(Buffer.from("RENDERED_JPG"));
});

describe("ответы Nest байт в байт (эталон — прежний mybook-api) (Authoring, часть 1 — все 37 маршрутов)", () => {
  it("books (5), book-model (1) и wizard (2): 200, ETag/304, 400, 401, 403, 404, 405, 409", async () => {
    // 1. themesList
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/themes" });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/themes?locale=kk" });
    // 2. bookCreate (200 и 400 мастера)
    await assertRoute({
      nest: app,
      method: "POST",
      url: "/api/v1/books",
      headers: mutOwner,
      body: { theme: "love", language: "ru", authorName: "Алия", authorGender: "f", recipientName: "Марат", recipientGender: "m", title: "О нас" },
    });
    await assertRoute({
      nest: app,
      method: "POST",
      url: "/api/v1/books",
      headers: mutOwner,
      body: { theme: "love", language: "ru", authorName: "Алия", authorGender: "f" },
    });
    // 3. booksList
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/books", headers: asOwner });
    // 4. bookEditor
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/editor`, headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/editor`, headers: asStranger });
    // 5. questionSave (vi.setSystemTime фиксирует updatedAt)
    await assertRoute({
      nest: app,
      method: "PATCH",
      url: `/api/v1/books/${BOOK_DRAFT_ID}/questions/${Q1_ID}`,
      headers: mutOwner,
      body: { answer: "Новый ответ", pageBreak: true },
    });
    // 6. bookModel
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/model`, headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/model?pages=64`, headers: { ...asOwner, [LOCALE_HEADER]: "kk" } });
    // 7. bookWizard
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/books/new", headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/books/new", headers: { ...asOwner, [LOCALE_HEADER]: "kk" } });
    // 8. wizardDeadline
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/occasions/deadline?occasion=anniversary&date=2027-06-15", headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/occasions/deadline?occasion=nope&date=2027-06-15", headers: asOwner });

    // Ошибки: 401 (ru/kk/en), 400 UUID, 403 CSRF, 405 Allow, 409 доменная ошибка
    for (const locale of ["ru", "kk", "en"]) {
      await assertRoute({ nest: app, method: "GET", url: "/api/v1/books", headers: { [LOCALE_HEADER]: locale } });
    }
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/books/not-a-uuid/editor", headers: asOwner });
    await assertRoute({
      nest: app,
      method: "PATCH",
      url: `/api/v1/books/${BOOK_DRAFT_ID}/questions/${Q1_ID}`,
      headers: { ...asOwner, origin: "https://evil.example" },
      body: { answer: "x" },
    });
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/questions/${Q1_ID}`, headers: asOwner });

    shared.questions.edit.mockRejectedValueOnce(new AuthoringError("bookLocked"));
    await assertRoute({
      nest: app,
      method: "PATCH",
      url: `/api/v1/books/${BOOK_ORDERED_ID}/questions/${Q1_ID}`,
      headers: mutOwner,
      body: { answer: "x" },
    });
  });

  it("web-book-pages (9 маршрутов): 200 (draft & ordered), ETag/304, 404 чужой книги", async () => {
    const urls = [
      `/api/v1/web/books/${BOOK_DRAFT_ID}`,
      `/api/v1/web/books/${BOOK_DRAFT_ID}/hub?locale=ru`,
      `/api/v1/web/books/${BOOK_DRAFT_ID}/nav?locale=kk`,
      `/api/v1/web/books/${BOOK_DRAFT_ID}/pages/questions`,
      `/api/v1/web/books/${BOOK_DRAFT_ID}/pages/photos?locale=ru`,
      `/api/v1/web/books/${BOOK_DRAFT_ID}/pages/letters`,
      `/api/v1/web/books/${BOOK_DRAFT_ID}/pages/cover?locale=ru`,
      `/api/v1/web/books/${BOOK_DRAFT_ID}/pages/pages?locale=ru`,
      `/api/v1/web/books/${BOOK_DRAFT_ID}/pages/preview`,
      // Заказанная книга (orderState, editable: false)
      `/api/v1/web/books/${BOOK_ORDERED_ID}/hub`,
      `/api/v1/web/books/${BOOK_ORDERED_ID}/nav`,
    ];
    for (const url of urls) {
      await assertRoute({ nest: app, method: "GET", url, headers: asOwner });
    }
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/web/books/${BOOK_DRAFT_ID}`, headers: asStranger });
  });

  it("photos (3), photo-editor (3) и dictation (1): 200, 400, 409, 413, 429, 502", async () => {
    // 18. photoUpload
    const imgMp = multipart("files", "a.jpg", "image/jpeg", "JPGDATA");
    await assertRoute({
      nest: app,
      method: "POST",
      url: `/api/v1/books/${BOOK_DRAFT_ID}/photos`,
      headers: { ...mutOwner, "content-type": `multipart/form-data; boundary=${imgMp.boundary}` },
      body: imgMp.body,
    });
    limiter.deny = true;
    shared.allowRate = false;
    await assertRoute({
      nest: app,
      method: "POST",
      url: `/api/v1/books/${BOOK_DRAFT_ID}/photos`,
      headers: { ...mutOwner, "content-type": `multipart/form-data; boundary=${imgMp.boundary}` },
      body: imgMp.body,
    });
    limiter.deny = false;
    shared.allowRate = true;

    // 19. photoUpdate
    await assertRoute({
      nest: app,
      method: "PATCH",
      url: `/api/v1/books/${BOOK_DRAFT_ID}/photos/${P1_ID}`,
      headers: mutOwner,
      body: { caption: "Горы", layout: "half" },
    });
    // 20. photoDelete
    await assertRoute({
      nest: app,
      method: "DELETE",
      url: `/api/v1/books/${BOOK_DRAFT_ID}/photos/${P1_ID}`,
      headers: mutOwner,
    });

    // 21. photoEditorGet (200 draft, 409 ordered)
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/photos/${P1_ID}/editor`, headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/books/${BOOK_ORDERED_ID}/photos/${P1_ID}/editor`, headers: asOwner });

    // 22. photoEditorSave (200 и 409 photosOutdated)
    const editBody = {
      version: "v1",
      edit: {
        v: 1,
        geometry: { turns: 1, flip: false, straighten: 0, crop: null, aspect: "free" },
        adjust: { brightness: 12 },
        levels: null,
        filter: { id: "warm", strength: 80 },
        layers: [],
      },
    };
    await assertRoute({
      nest: app,
      method: "PUT",
      url: `/api/v1/books/${BOOK_DRAFT_ID}/photos/${P1_ID}/editor`,
      headers: mutOwner,
      body: editBody,
    });
    await assertRoute({
      nest: app,
      method: "PUT",
      url: `/api/v1/books/${BOOK_DRAFT_ID}/photos/${P1_ID}/editor`,
      headers: mutOwner,
      body: { ...editBody, version: "stale" },
    });

    // 23. photoEditorRevert
    await assertRoute({
      nest: app,
      method: "DELETE",
      url: `/api/v1/books/${BOOK_DRAFT_ID}/photos/${P1_ID}/editor`,
      headers: mutOwner,
    });

    // 24. answerDictate (200, 400 без файла, 429, 502)
    const audioMp = multipart("audio", "voice.m4a", "audio/mp4", "AUDIOBYTES");
    await assertRoute({
      nest: app,
      method: "POST",
      url: `/api/v1/books/${BOOK_DRAFT_ID}/dictation`,
      headers: { ...mutOwner, "content-type": `multipart/form-data; boundary=${audioMp.boundary}` },
      body: audioMp.body,
    });
    const noAudioMp = multipart("other", "x.m4a", "audio/mp4", "X");
    await assertRoute({
      nest: app,
      method: "POST",
      url: `/api/v1/books/${BOOK_DRAFT_ID}/dictation`,
      headers: { ...mutOwner, "content-type": `multipart/form-data; boundary=${noAudioMp.boundary}` },
      body: noAudioMp.body,
    });
    limiter.deny = true;
    shared.allowRate = false;
    await assertRoute({
      nest: app,
      method: "POST",
      url: `/api/v1/books/${BOOK_DRAFT_ID}/dictation`,
      headers: { ...mutOwner, "content-type": `multipart/form-data; boundary=${audioMp.boundary}` },
      body: audioMp.body,
    });
    limiter.deny = false;
    shared.allowRate = true;

    shared.assistant.dictate.mockResolvedValueOnce({ error: "fail" });
    await assertRoute({
      nest: app,
      method: "POST",
      url: `/api/v1/books/${BOOK_DRAFT_ID}/dictation`,
      headers: { ...mutOwner, "content-type": `multipart/form-data; boundary=${audioMp.boundary}` },
      body: audioMp.body,
    });
  });

  it("letters (6 маршрутов): 200, ETag/304 и 404", async () => {
    // 25. lettersGet
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/letters`, headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/letters`, headers: { ...asOwner, [LOCALE_HEADER]: "kk" } });
    // 26. letterInviteSet
    await assertRoute({
      nest: app,
      method: "POST",
      url: `/api/v1/books/${BOOK_DRAFT_ID}/letters/invite`,
      headers: mutOwner,
      body: { enabled: true, regenerate: false },
    });
    // 27. letterInviteText
    await assertRoute({
      nest: app,
      method: "PUT",
      url: `/api/v1/books/${BOOK_DRAFT_ID}/letters/invite-text`,
      headers: mutOwner,
      body: { text: "Ждём ваши письма" },
    });
    // 28. lettersReorder
    await assertRoute({
      nest: app,
      method: "PUT",
      url: `/api/v1/books/${BOOK_DRAFT_ID}/letters/order`,
      headers: mutOwner,
      body: { ids: [L2_ID, L1_ID] },
    });
    // 29. letterUpdate
    await assertRoute({
      nest: app,
      method: "PATCH",
      url: `/api/v1/books/${BOOK_DRAFT_ID}/letters/${L1_ID}`,
      headers: mutOwner,
      body: { status: "approved", relation: "старшая сестра" },
    });
    // 30. letterDelete
    await assertRoute({
      nest: app,
      method: "DELETE",
      url: `/api/v1/books/${BOOK_DRAFT_ID}/letters/${L2_ID}`,
      headers: mutOwner,
    });
  });

  it("cover (5 маршрутов) и preview (2 маршрута): 200, 400, 404, 409, ETag/304", async () => {
    // 31. coverGet
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/cover`, headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/cover`, headers: { ...asOwner, [LOCALE_HEADER]: "kk" } });
    // 32. coverUpdate
    await assertRoute({
      nest: app,
      method: "PATCH",
      url: `/api/v1/books/${BOOK_DRAFT_ID}/cover`,
      headers: mutOwner,
      body: { title: "Новое название", coverLines: false },
    });
    await assertRoute({
      nest: app,
      method: "PATCH",
      url: `/api/v1/books/${BOOK_ORDERED_ID}/cover`,
      headers: mutOwner,
      body: { title: "Нельзя" },
    });
    // 33. coverDesignSave
    await assertRoute({
      nest: app,
      method: "PUT",
      url: `/api/v1/books/${BOOK_DRAFT_ID}/cover/design`,
      headers: mutOwner,
      body: { coverDesign: { v: 1, background: { kind: "color", color: "#FFFFFF" }, layers: [] }, coverBack: null },
    });
    // 34. coverDesignInit (front, back и 400 badRequest)
    await assertRoute({
      nest: app,
      method: "POST",
      url: `/api/v1/books/${BOOK_DRAFT_ID}/cover/design/init`,
      headers: mutOwner,
      body: { side: "front" },
    });
    await assertRoute({
      nest: app,
      method: "POST",
      url: `/api/v1/books/${BOOK_DRAFT_ID}/cover/design/init`,
      headers: mutOwner,
      body: { side: "back", backLayout: "quote" },
    });
    await assertRoute({
      nest: app,
      method: "POST",
      url: `/api/v1/books/${BOOK_DRAFT_ID}/cover/design/init`,
      headers: mutOwner,
      body: { side: "front", layoutId: "unknown-layout" },
    });
    // 35. coverDesignReset
    await assertRoute({
      nest: app,
      method: "POST",
      url: `/api/v1/books/${BOOK_DRAFT_ID}/cover/design/reset`,
      headers: mutOwner,
      body: { side: "front", coverTemplate: "linen" },
    });
    await assertRoute({
      nest: app,
      method: "POST",
      url: `/api/v1/books/${BOOK_DRAFT_ID}/cover/design/reset`,
      headers: mutOwner,
      body: { side: "back" },
    });

    // 36. bookBuild (ready, building, failed, 404)
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/build`, headers: asOwner });
    shared.previews.build.mockResolvedValue({ status: "failed", previous: sampleBuild, error: "renderFailed", retryInMs: 30_000 });
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/build?retry=1`, headers: asOwner });
    shared.previews.build.mockResolvedValue(null);
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/build`, headers: asOwner });

    // 37. bookBuildProgress (active и null)
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/build/progress`, headers: asOwner });
    shared.previews.progressOf.mockReturnValue(null);
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/build/progress`, headers: asOwner });
  });
});
