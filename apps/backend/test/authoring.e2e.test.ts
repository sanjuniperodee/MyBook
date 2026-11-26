import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { InjectOptions } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { v1 } from "@mybook/contracts";
import { LOCALE_HEADER } from "@/i18n/config";
import { StaffContext } from "@/modules/access/domain/StaffContext";
import { AuthoringError, isBookVisibleTo, type BookRow, type BookViewer, type ChapterRow, type LetterRow, type PhotoRow, type QuestionRow } from "@/modules/authoring";
import { isPhoneEmail } from "@/modules/identity";
import { allPermissions } from "@/shared/domain/permissions";
import { STAFF_ACCESS, type StaffAccessPort } from "../src/core/auth/staff";
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
const STAFF_VIEW = testUser("33333333-3333-4333-8333-333333333333", { name: "Смотрящий", role: "admin", locale: "ru" });
const STAFF_EDIT = testUser("44444444-4444-4444-8444-444444444444", { name: "Редактор", role: "admin", locale: "ru" });
const STAFF_OWN = testUser("55555555-5555-4555-8555-555555555555", { name: "Менеджер", role: "admin", locale: "ru" });
const STAFF_2FA_BLOCKED = testUser("66666666-6666-4666-8666-666666666666", { name: "Без2ФА", role: "admin", locale: "ru" });

const BOOK_DRAFT_ID = "aaaa1111-1111-4111-8111-111111111111";
const BOOK_ORDERED_ID = "aaaa2222-2222-4222-8222-222222222222";
const BOOK_STAFF_SELF_ID = "aaaa3333-3333-4333-8333-333333333333";
const Q1_ID = "bbbb1111-1111-4111-8111-111111111111";
const Q2_ID = "bbbb2222-2222-4222-8222-222222222222";
const P1_ID = "cccc1111-1111-4111-8111-111111111111";
const P2_ID = "cccc2222-2222-4222-8222-222222222222";
const L1_ID = "dddd1111-1111-4111-8111-111111111111";
const L2_ID = "dddd2222-2222-4222-8222-222222222222";
const ORDER_PAID_ID = "eeee1111-1111-4111-8111-111111111111";
const ORDER_CANCELLED_ID = "eeee2222-2222-4222-8222-222222222222";

const ORIGIN = "http://localhost:3000";
const authOf = (u: typeof OWNER) => ({ cookie: `mb_session=${sessionOf(u)}` });
const asOwner = authOf(OWNER);

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
const cancelledOrder: AuthoringOrderBrief = { id: ORDER_CANCELLED_ID, bookId: BOOK_ORDERED_ID, number: 502, status: "cancelled", plan: "classic" };

function multipartBody(field: string, filename: string, mime: string, content: Buffer | string) {
  const boundary = "----mb-authoring-test";
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`, "utf8");
  const body = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return { boundary, payload: Buffer.concat([head, body, tail]) };
}

let booksMap = new Map<string, BookRow>();
let managerByBook = new Map<string, string | null>();
const photoRepositoryStub = { tag: "photo-repo" };

const booksSvc = { start: vi.fn(), updateSettings: vi.fn(), setLetterInvite: vi.fn() };
const questionsSvc = { edit: vi.fn() };
const photosSvc = { upload: vi.fn(), update: vi.fn(), delete: vi.fn(), editState: vi.fn(), originalKey: vi.fn(), saveEdit: vi.fn(), revertEdit: vi.fn() };
const lettersSvc = { edit: vi.fn(), reorder: vi.fn(), delete: vi.fn() };
const photoFileMock = vi.fn();

const queriesMock = {
  book: vi.fn(async (id: string) => booksMap.get(id) ?? null),
  visibleBook: vi.fn(async (id: string, viewer: BookViewer) => {
    const b = booksMap.get(id);
    return b && isBookVisibleTo(b.userId, viewer) ? b : null;
  }),
  userBooks: vi.fn(async (userId: string) =>
    [...booksMap.values()]
      .filter((b) => b.userId === userId)
      .map((book) => ({ book, answered: 1, total: 2, words: 12, photos: 2 })),
  ),
  questions: vi.fn(async () => sampleQuestions),
  chapters: vi.fn(async () => sampleChapters),
  photos: vi.fn(async () => samplePhotos),
  editedPhotoIds: vi.fn(async () => new Set([P1_ID])),
  letters: vi.fn(async () => sampleLetters),
  approvedLetters: vi.fn(async () => sampleLetters.filter((l) => l.status === "approved")),
  stats: vi.fn(async () => ({ answered: 1, total: 2, words: 12, photos: 2, estimatedPages: 34, printedPages: 40, emptyChapters: 0 })),
  bundle: vi.fn(async (id: string) => {
    const book = booksMap.get(id);
    return book ? { book, questions: sampleQuestions, chapters: sampleChapters, photos: samplePhotos, letters: sampleLetters.filter((l) => l.status === "approved") } : null;
  }),
  photoFor: vi.fn(async (photoId: string) => samplePhotos.find((p) => p.id === photoId) ?? null),
};

const orderingPort = {
  userOrders: vi.fn(async () => [cancelledOrder, paidOrder]),
  lastOrderOfBook: vi.fn(async (bookId: string) => (bookId === BOOK_ORDERED_ID ? paidOrder : null)),
  agreementFor: vi.fn(async () => null),
};

const previewsPort = {
  current: vi.fn<() => Promise<typeof sampleBuild | null>>(async () => sampleBuild),
  build: vi.fn(),
  progressOf: vi.fn(),
};

const assistantPort = {
  dictate: vi.fn(),
  proofreadConfigured: vi.fn(async () => true),
  writerConfigured: vi.fn(async () => false),
};

const photoLimitPort = { maxPhotos: vi.fn(async () => 120) };
const photoRendererPort = {
  probeOriginal: vi.fn(async () => ({ width: 2000, height: 1500, suggestedLevels: { black: 0.02, white: 0.98, gamma: 1.05 } })),
  renderEdit: vi.fn(async () => Buffer.from("RENDERED_JPG")),
};

const staffAccess: StaffAccessPort = {
  async resolve(user) {
    if (user.id === STAFF_VIEW.id) {
      return { context: new StaffContext(user.id, "Просмотр", "viewer", "all", new Set(["clients.view"]), false, { isPhoneEmail }), gate: null };
    }
    if (user.id === STAFF_EDIT.id) {
      return { context: new StaffContext(user.id, "Редактор", "editor", "all", new Set(["clients.view", "clients.edit"]), false, { isPhoneEmail }), gate: null };
    }
    if (user.id === STAFF_OWN.id) {
      return { context: new StaffContext(user.id, "Менеджер", "sales", "own", new Set(["clients.view", "clients.edit"]), false, { isPhoneEmail }), gate: null };
    }
    if (user.id === STAFF_2FA_BLOCKED.id) {
      return { context: new StaffContext(user.id, "Без 2FA", "owner", "all", new Set(allPermissions), true, { isPhoneEmail }), gate: "2fa" };
    }
    return null;
  },
};

let app: NestFastifyApplication;
let limiter: FakeLimiter;
const call = (opts: InjectOptions) => app.inject(opts);

const EXPECTED_ROUTES: { method: string; path: string }[] = [
  // books (5) + book-model (1) + wizard (2)
  { method: "GET", path: "/api/v1/themes" },
  { method: "POST", path: "/api/v1/books" },
  { method: "GET", path: "/api/v1/books" },
  { method: "GET", path: "/api/v1/books/new" },
  { method: "GET", path: "/api/v1/occasions/deadline" },
  { method: "GET", path: "/api/v1/books/:bookId/editor" },
  { method: "PATCH", path: "/api/v1/books/:bookId/questions/:questionId" },
  { method: "GET", path: "/api/v1/books/:bookId/model" },
  // web-book-pages (9)
  { method: "GET", path: "/api/v1/web/books/:bookId" },
  { method: "GET", path: "/api/v1/web/books/:bookId/hub" },
  { method: "GET", path: "/api/v1/web/books/:bookId/nav" },
  { method: "GET", path: "/api/v1/web/books/:bookId/pages/questions" },
  { method: "GET", path: "/api/v1/web/books/:bookId/pages/photos" },
  { method: "GET", path: "/api/v1/web/books/:bookId/pages/letters" },
  { method: "GET", path: "/api/v1/web/books/:bookId/pages/cover" },
  { method: "GET", path: "/api/v1/web/books/:bookId/pages/pages" },
  { method: "GET", path: "/api/v1/web/books/:bookId/pages/preview" },
  // photos (3) + photo-editor (3) + dictation (1)
  { method: "POST", path: "/api/v1/books/:bookId/photos" },
  { method: "PATCH", path: "/api/v1/books/:bookId/photos/:photoId" },
  { method: "DELETE", path: "/api/v1/books/:bookId/photos/:photoId" },
  { method: "GET", path: "/api/v1/books/:bookId/photos/:photoId/editor" },
  { method: "PUT", path: "/api/v1/books/:bookId/photos/:photoId/editor" },
  { method: "DELETE", path: "/api/v1/books/:bookId/photos/:photoId/editor" },
  { method: "POST", path: "/api/v1/books/:bookId/dictation" },
  // letters (6)
  { method: "GET", path: "/api/v1/books/:bookId/letters" },
  { method: "POST", path: "/api/v1/books/:bookId/letters/invite" },
  { method: "PUT", path: "/api/v1/books/:bookId/letters/invite-text" },
  { method: "PUT", path: "/api/v1/books/:bookId/letters/order" },
  { method: "PATCH", path: "/api/v1/books/:bookId/letters/:letterId" },
  { method: "DELETE", path: "/api/v1/books/:bookId/letters/:letterId" },
  // cover (5)
  { method: "GET", path: "/api/v1/books/:bookId/cover" },
  { method: "PATCH", path: "/api/v1/books/:bookId/cover" },
  { method: "PUT", path: "/api/v1/books/:bookId/cover/design" },
  { method: "POST", path: "/api/v1/books/:bookId/cover/design/init" },
  { method: "POST", path: "/api/v1/books/:bookId/cover/design/reset" },
  // preview (2)
  { method: "GET", path: "/api/v1/books/:bookId/build" },
  { method: "GET", path: "/api/v1/books/:bookId/build/progress" },
];

beforeAll(async () => {
  ({ app, limiter } = await bootTestApp({
    users: [OWNER, STRANGER, STAFF_VIEW, STAFF_EDIT, STAFF_OWN, STAFF_2FA_BLOCKED],
    overrides: [
      [STAFF_ACCESS, staffAccess],
      [
        AUTHORING,
        {
          books: booksSvc,
          questions: questionsSvc,
          photos: photosSvc,
          letters: lettersSvc,
          queries: queriesMock,
          photoRepository: photoRepositoryStub,
          photoFile: photoFileMock,
        },
      ],
      [AUTHORING_BOOK_OWNERSHIP, { bookOwnership: async (bookId: string) => (managerByBook.has(bookId) ? { managerId: managerByBook.get(bookId) ?? null } : null) }],
      [AUTHORING_ORDERING, orderingPort],
      [AUTHORING_PREVIEWS, previewsPort],
      [AUTHORING_ASSISTANT, assistantPort],
      [AUTHORING_PHOTO_LIMIT, photoLimitPort],
      [AUTHORING_PHOTO_RENDERER, photoRendererPort],
    ],
  }));
});

afterAll(() => app.close());

beforeEach(() => {
  vi.clearAllMocks();
  limiter.hits.length = 0;
  limiter.deny = false;
  booksMap = new Map([
    [BOOK_DRAFT_ID, makeBook()],
    [BOOK_ORDERED_ID, makeBook({ id: BOOK_ORDERED_ID, status: "ordered" })],
    [BOOK_STAFF_SELF_ID, makeBook({ id: BOOK_STAFF_SELF_ID, userId: STAFF_2FA_BLOCKED.id })],
  ]);
  managerByBook = new Map([[BOOK_DRAFT_ID, STAFF_OWN.id]]);

  booksSvc.start.mockResolvedValue({ id: BOOK_DRAFT_ID });
  booksSvc.updateSettings.mockResolvedValue(undefined);
  booksSvc.setLetterInvite.mockResolvedValue("new-token-777");
  questionsSvc.edit.mockResolvedValue(undefined);
  photosSvc.upload.mockResolvedValue({ created: [{ id: P1_ID }], failed: [], damaged: [] });
  photosSvc.update.mockResolvedValue(undefined);
  photosSvc.delete.mockResolvedValue(undefined);
  photosSvc.editState.mockResolvedValue({ edit: null, version: "v1" });
  photosSvc.originalKey.mockResolvedValue(`photos/${BOOK_DRAFT_ID}/${P1_ID}_orig.jpg`);
  photosSvc.saveEdit.mockResolvedValue(undefined);
  photosSvc.revertEdit.mockResolvedValue(undefined);
  photoFileMock.mockResolvedValue(Buffer.from("RAW_ORIG"));
  lettersSvc.edit.mockResolvedValue(undefined);
  lettersSvc.reorder.mockResolvedValue(undefined);
  lettersSvc.delete.mockResolvedValue(undefined);
  previewsPort.current.mockResolvedValue(sampleBuild);
  previewsPort.build.mockResolvedValue({ status: "ready", build: sampleBuild });
  previewsPort.progressOf.mockReturnValue({ state: "running", stage: "flow", percent: 42.6, etaMs: 3200.4, overrun: false, ahead: 0 });
  assistantPort.dictate.mockResolvedValue({ text: "  Привет, мир!  ", by: "gemini" });
  assistantPort.proofreadConfigured.mockResolvedValue(true);
  assistantPort.writerConfigured.mockResolvedValue(false);
  orderingPort.userOrders.mockResolvedValue([cancelledOrder, paidOrder]);
  orderingPort.lastOrderOfBook.mockImplementation(async (bookId: string) => (bookId === BOOK_ORDERED_ID ? paidOrder : null));
  orderingPort.agreementFor.mockResolvedValue(null);
  photoLimitPort.maxPhotos.mockResolvedValue(120);
  photoRendererPort.probeOriginal.mockResolvedValue({ width: 2000, height: 1500, suggestedLevels: { black: 0.02, white: 0.98, gamma: 1.05 } });
  photoRendererPort.renderEdit.mockResolvedValue(Buffer.from("RENDERED_JPG"));
});

describe("контекст Authoring (часть 1 — 37 маршрутов)", () => {
  it("реестр маршрутов содержит все 37 маршрутов части 1 Authoring", async () => {
    expect(EXPECTED_ROUTES).toHaveLength(37);
    const res = await call({ method: "GET", url: "/api/v1/__nest/routes" });
    expect(res.statusCode).toBe(200);
    const routes = res.json().routes as { method: string; path: string }[];
    for (const r of EXPECTED_ROUTES) {
      expect(routes).toContainEqual(r);
    }
  });

  describe("books, book-model и wizard (8 маршрутов)", () => {
    it("GET /themes: без входа, язык из ?locale и cookie, ETag/304 и 405", async () => {
      const ru = await call({ method: "GET", url: "/api/v1/themes" });
      expect(ru.statusCode).toBe(200);
      expect(v1.themesList.response.parse(ru.json()).themes.length).toBeGreaterThan(0);

      const again = await call({ method: "GET", url: "/api/v1/themes", headers: { "if-none-match": String(ru.headers.etag) } });
      expect(again.statusCode).toBe(304);

      const kk = await call({ method: "GET", url: "/api/v1/themes?locale=kk" });
      expect(kk.statusCode).toBe(200);
      expect(kk.json().themes[0].name).not.toBe(ru.json().themes[0].name);

      const wrong = await call({ method: "DELETE", url: "/api/v1/themes" });
      expect(wrong.statusCode).toBe(405);
      expect(wrong.headers.allow).toBe("GET");
    });

    it("POST /books: создание, 400 мастера, 401, 403 CSRF, доменная ошибка", async () => {
      const noAuth = await call({ method: "POST", url: "/api/v1/books", payload: {} });
      expect(noAuth.statusCode).toBe(401);

      const csrf = await call({ method: "POST", url: "/api/v1/books", headers: { ...asOwner, origin: "https://evil.example" }, payload: {} });
      expect(csrf.statusCode).toBe(403);

      const missingRecipient = await call({
        method: "POST",
        url: "/api/v1/books",
        headers: { ...asOwner, origin: ORIGIN },
        payload: { theme: "love", language: "ru", authorName: "Алия", authorGender: "f" },
      });
      expect(missingRecipient.statusCode).toBe(400);
      expect(missingRecipient.json().code).toBe("badData");
      expect(booksSvc.start).not.toHaveBeenCalled();

      const ok = await call({
        method: "POST",
        url: "/api/v1/books",
        headers: { ...asOwner, origin: ORIGIN },
        payload: { theme: "love", language: "ru", authorName: "Алия", authorGender: "f", recipientName: "Марат", recipientGender: "m", title: "О нас" },
      });
      expect(ok.statusCode).toBe(200);
      expect(v1.bookCreate.response.parse(ok.json())).toEqual({ id: BOOK_DRAFT_ID });
      expect(booksSvc.start).toHaveBeenCalledWith(OWNER.id, expect.objectContaining({ theme: "love", authorName: "Алия", recipientName: "Марат", title: "О нас" }));

      booksSvc.start.mockRejectedValueOnce(new AuthoringError("unknownTheme"));
      const domErr = await call({
        method: "POST",
        url: "/api/v1/books",
        headers: { ...asOwner, origin: ORIGIN },
        payload: { theme: "love", language: "ru", authorName: "Алия", authorGender: "f", recipientName: "Марат", recipientGender: "m" },
      });
      expect(domErr.statusCode).toBe(400);
      expect(domErr.json().code).toBe("unknownTheme");
    });

    it("GET /books: список книг с действующим заказом поверх отменённого, ETag и 401", async () => {
      expect((await call({ method: "GET", url: "/api/v1/books" })).statusCode).toBe(401);
      const res = await call({ method: "GET", url: "/api/v1/books", headers: asOwner });
      expect(res.statusCode).toBe(200);
      const parsed = v1.booksList.response.parse(res.json());
      const ordered = parsed.books.find((b) => b.id === BOOK_ORDERED_ID);
      expect(ordered?.order).toEqual({ id: ORDER_PAID_ID, number: 501, status: "paid", printed: true });
      const cached = await call({ method: "GET", url: "/api/v1/books", headers: { ...asOwner, "if-none-match": String(res.headers.etag) } });
      expect(cached.statusCode).toBe(304);
    });

    it("GET /books/new и GET /occasions/deadline: мастер и подсказка срока", async () => {
      expect((await call({ method: "GET", url: "/api/v1/books/new" })).statusCode).toBe(401);
      const wiz = await call({ method: "GET", url: "/api/v1/books/new", headers: { ...asOwner, [LOCALE_HEADER]: "kk" } });
      expect(wiz.statusCode).toBe(200);
      const w = v1.bookWizard.response.parse(wiz.json());
      expect(w.defaultLanguage).toBe("kk");
      expect(w.defaultAuthor).toBe("Алия");

      const dl = await call({ method: "GET", url: "/api/v1/occasions/deadline?occasion=anniversary&date=2028-06-15", headers: asOwner });
      expect(dl.statusCode).toBe(200);
      expect(v1.wizardDeadline.response.parse(dl.json()).text).toBeTruthy();

      const unknownOcc = await call({ method: "GET", url: "/api/v1/occasions/deadline?occasion=nope&date=2028-06-15", headers: asOwner });
      expect(unknownOcc.statusCode).toBe(200);
      expect(unknownOcc.json()).toEqual({ text: null });

      const badDate = await call({ method: "GET", url: "/api/v1/occasions/deadline?occasion=anniversary&date=bad", headers: asOwner });
      expect(badDate.statusCode).toBe(400);
    });

    it("GET /books/:id/editor: доступ владельца, чужого, сотрудника (view / edit / own scope / 2FA gate) и 400 до 404", async () => {
      const badUuid = await call({ method: "GET", url: "/api/v1/books/not-a-uuid/editor", headers: authOf(STRANGER) });
      expect(badUuid.statusCode).toBe(400);
      expect(badUuid.json().code).toBe("badData");

      const foreign = await call({ method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/editor`, headers: authOf(STRANGER) });
      expect(foreign.statusCode).toBe(404);
      expect(foreign.json().code).toBe("bookNotFound");

      const ownerRes = await call({ method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/editor`, headers: asOwner });
      expect(ownerRes.statusCode).toBe(200);
      expect(v1.bookEditor.response.parse(ownerRes.json())).toMatchObject({ editable: true, maxPhotos: 120 });

      const staffView = await call({ method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/editor`, headers: authOf(STAFF_VIEW) });
      expect(staffView.statusCode).toBe(200);
      expect(staffView.json().editable).toBe(false);

      const staffEdit = await call({ method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/editor`, headers: authOf(STAFF_EDIT) });
      expect(staffEdit.statusCode).toBe(200);
      expect(staffEdit.json().editable).toBe(true);

      // Сотрудник со scope="own": видит книгу своего клиента (managerId = STAFF_OWN.id), чужую — 404.
      const staffOwnOk = await call({ method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/editor`, headers: authOf(STAFF_OWN) });
      expect(staffOwnOk.statusCode).toBe(200);
      expect(staffOwnOk.json().editable).toBe(true);

      managerByBook.set(BOOK_DRAFT_ID, STAFF_EDIT.id);
      const staffOwnDenied = await call({ method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/editor`, headers: authOf(STAFF_OWN) });
      expect(staffOwnDenied.statusCode).toBe(404);

      // Сотрудник с 2FA gate теряет доступ к клиентским книгам, но сохраняет доступ к собственной.
      const blockedClient = await call({ method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/editor`, headers: authOf(STAFF_2FA_BLOCKED) });
      expect(blockedClient.statusCode).toBe(404);
      const blockedSelf = await call({ method: "GET", url: `/api/v1/books/${BOOK_STAFF_SELF_ID}/editor`, headers: authOf(STAFF_2FA_BLOCKED) });
      expect(blockedSelf.statusCode).toBe(200);
    });

    it("PATCH /books/:id/questions/:qid: автосохранение, ошибки схемы/домена, 405", async () => {
      const ok = await call({
        method: "PATCH",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/questions/${Q1_ID}`,
        headers: { ...asOwner, origin: ORIGIN },
        payload: { answer: "Новый ответ", hideHeading: true },
      });
      expect(ok.statusCode).toBe(200);
      expect(v1.questionSave.response.parse(ok.json()).ok).toBe(true);
      expect(questionsSvc.edit).toHaveBeenCalledWith(
        BOOK_DRAFT_ID,
        { userId: OWNER.id, isStaff: false, staffEdits: false },
        Q1_ID,
        { answer: "Новый ответ", hideHeading: true },
      );

      const extraField = await call({
        method: "PATCH",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/questions/${Q1_ID}`,
        headers: { ...asOwner, origin: ORIGIN },
        payload: { answer: "x", hack: true },
      });
      expect(extraField.statusCode).toBe(400);

      questionsSvc.edit.mockRejectedValueOnce(new AuthoringError("bookLocked"));
      const locked = await call({
        method: "PATCH",
        url: `/api/v1/books/${BOOK_ORDERED_ID}/questions/${Q1_ID}`,
        headers: { ...asOwner, origin: ORIGIN },
        payload: { answer: "x" },
      });
      expect(locked.statusCode).toBe(409);
      expect(locked.json().code).toBe("bookLocked");

      const wrong = await call({ method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/questions/${Q1_ID}`, headers: asOwner });
      expect(wrong.statusCode).toBe(405);
      expect(wrong.headers.allow).toBe("PATCH");
    });

    it("GET /books/:id/model: ?pages, фолбэк на сборку и stats, 400 и 404", async () => {
      const explicit = await call({ method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/model?pages=64`, headers: asOwner });
      expect(explicit.statusCode).toBe(200);
      expect(v1.bookModel.response.parse(explicit.json()).pageCount).toBe(64);
      expect(previewsPort.current).not.toHaveBeenCalled();

      const fromBuild = await call({ method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/model`, headers: asOwner });
      expect(fromBuild.statusCode).toBe(200);
      expect(fromBuild.json().pageCount).toBe(48);

      previewsPort.current.mockResolvedValueOnce(null);
      const fromStats = await call({ method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/model`, headers: asOwner });
      expect(fromStats.statusCode).toBe(200);
      expect(fromStats.json().pageCount).toBe(40);

      expect((await call({ method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/model?pages=0`, headers: asOwner })).statusCode).toBe(400);
      expect((await call({ method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/model`, headers: authOf(STRANGER) })).statusCode).toBe(404);
    });
  });

  describe("web-book-pages (9 маршрутов)", () => {
    const webEndpoints = [
      ["webBook", `/api/v1/web/books/${BOOK_DRAFT_ID}`, v1.webBook.response],
      ["webBookHub", `/api/v1/web/books/${BOOK_DRAFT_ID}/hub?locale=ru`, v1.webBookHub.response],
      ["webBookNav", `/api/v1/web/books/${BOOK_DRAFT_ID}/nav?locale=kk`, v1.webBookNav.response],
      ["webBookQuestionsPage", `/api/v1/web/books/${BOOK_DRAFT_ID}/pages/questions`, v1.webBookQuestionsPage.response],
      ["webBookPhotosPage", `/api/v1/web/books/${BOOK_DRAFT_ID}/pages/photos?locale=ru`, v1.webBookPhotosPage.response],
      ["webBookLettersPage", `/api/v1/web/books/${BOOK_DRAFT_ID}/pages/letters`, v1.webBookLettersPage.response],
      ["webBookCoverPage", `/api/v1/web/books/${BOOK_DRAFT_ID}/pages/cover?locale=ru`, v1.webBookCoverPage.response],
      ["webBookPagesPage", `/api/v1/web/books/${BOOK_DRAFT_ID}/pages/pages?locale=ru`, v1.webBookPagesPage.response],
      ["webBookPreviewPage", `/api/v1/web/books/${BOOK_DRAFT_ID}/pages/preview`, v1.webBookPreviewPage.response],
    ] as const;

    it("все 9 GET-маршрутов возвращают валидный контракт, ETag/304, 401, 404 (чужой) и 405", async () => {
      for (const [name, url, schema] of webEndpoints) {
        expect((await call({ method: "GET", url })).statusCode, `${name} 401`).toBe(401);
        expect((await call({ method: "GET", url, headers: authOf(STRANGER) })).statusCode, `${name} 404`).toBe(404);
        const ok = await call({ method: "GET", url, headers: asOwner });
        expect(ok.statusCode, `${name} 200`).toBe(200);
        schema.parse(ok.json());
        const cached = await call({ method: "GET", url, headers: { ...asOwner, "if-none-match": String(ok.headers.etag) } });
        expect(cached.statusCode, `${name} 304`).toBe(304);
        const wrong = await call({ method: "POST", url, headers: { ...asOwner, origin: ORIGIN } });
        expect(wrong.statusCode, `${name} 405`).toBe(405);
        expect(wrong.headers.allow).toBe(name === "webBook" ? "DELETE, GET" : "GET");
      }
    });

    it("заказанная книга: webBookNav заполняет orderState, webBookQuestionsPage не зовёт AI", async () => {
      const nav = await call({ method: "GET", url: `/api/v1/web/books/${BOOK_ORDERED_ID}/nav`, headers: asOwner });
      expect(nav.statusCode).toBe(200);
      expect(nav.json().orderState).toMatchObject({ tone: "success" });

      const qp = await call({ method: "GET", url: `/api/v1/web/books/${BOOK_ORDERED_ID}/pages/questions`, headers: asOwner });
      expect(qp.statusCode).toBe(200);
      expect(qp.json()).toMatchObject({ editable: false, proofreadAi: false, writerAi: false });
      expect(assistantPort.proofreadConfigured).not.toHaveBeenCalled();
    });
  });

  describe("photos, photo-editor и dictation (7 маршрутов)", () => {
    it("POST /photos: multipart загрузка, лимит upload:<userId>, ошибки по файлам, 400 и 429", async () => {
      photosSvc.upload.mockResolvedValueOnce({
        created: [{ id: P1_ID }],
        failed: [{ name: "huge.jpg", reason: "tooBig" }, { name: "doc.pdf", reason: "format" }],
        damaged: ["broken.jpg"],
      });
      const mp = multipartBody("files", "a.jpg", "image/jpeg", "JPGDATA");
      const ok = await call({
        method: "POST",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/photos`,
        headers: { ...asOwner, origin: ORIGIN, "content-type": `multipart/form-data; boundary=${mp.boundary}` },
        payload: mp.payload,
      });
      expect(ok.statusCode).toBe(200);
      const parsed = v1.photoUpload.response.parse(ok.json());
      expect(parsed.photos).toHaveLength(1);
      expect(parsed.errors).toHaveLength(3);
      expect(limiter.hits).toEqual([`upload:${OWNER.id}`]);
      expect(photosSvc.upload).toHaveBeenCalledWith(BOOK_DRAFT_ID, expect.objectContaining({ userId: OWNER.id }), expect.any(Array), 120);

      limiter.deny = true;
      const limited = await call({
        method: "POST",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/photos`,
        headers: { ...asOwner, origin: ORIGIN, "content-type": `multipart/form-data; boundary=${mp.boundary}` },
        payload: mp.payload,
      });
      expect(limited.statusCode).toBe(429);
      expect(limited.json().code).toBe("photosRate");

      const notMp = await call({ method: "POST", url: `/api/v1/books/${BOOK_DRAFT_ID}/photos`, headers: { ...asOwner, origin: ORIGIN }, payload: {} });
      expect(notMp.statusCode).toBe(400);
      expect(notMp.json().code).toBe("badRequest");
    });

    it("PATCH и DELETE /photos/:photoId: правка, удаление, 404 и 405", async () => {
      const upd = await call({
        method: "PATCH",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/photos/${P1_ID}`,
        headers: { ...asOwner, origin: ORIGIN },
        payload: { caption: "Новая подпись", layout: "half" },
      });
      expect(upd.statusCode).toBe(200);
      expect(v1.photoUpdate.response.parse(upd.json())).toMatchObject({ photo: { id: P1_ID }, layoutRev: 2 });
      expect(photosSvc.update).toHaveBeenCalledWith(BOOK_DRAFT_ID, expect.objectContaining({ userId: OWNER.id }), P1_ID, { caption: "Новая подпись", layout: "half" });

      const missingPhoto = await call({
        method: "PATCH",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/photos/99999999-9999-4999-8999-999999999999`,
        headers: { ...asOwner, origin: ORIGIN },
        payload: { caption: "x" },
      });
      expect(missingPhoto.statusCode).toBe(404);

      const del = await call({ method: "DELETE", url: `/api/v1/books/${BOOK_DRAFT_ID}/photos/${P1_ID}`, headers: { ...asOwner, origin: ORIGIN } });
      expect(del.statusCode).toBe(200);
      expect(del.json()).toEqual({ ok: true });
      expect(photosSvc.delete).toHaveBeenCalledWith(BOOK_DRAFT_ID, expect.objectContaining({ userId: OWNER.id }), P1_ID);

      const wrong = await call({ method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/photos/${P1_ID}`, headers: asOwner });
      expect(wrong.statusCode).toBe(405);
      expect(wrong.headers.allow).toBe("PATCH, DELETE");
    });

    it("GET / PUT / DELETE /photos/:photoId/editor: состояние, сохранение, сброс, лимит, конфликт версии, 409 на заказанной", async () => {
      const getOk = await call({ method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/photos/${P1_ID}/editor`, headers: asOwner });
      expect(getOk.statusCode).toBe(200);
      const state = v1.photoEditorGet.response.parse(getOk.json());
      expect(state).toMatchObject({ bookId: BOOK_DRAFT_ID, photoId: P1_ID, originalWidth: 2000, originalHeight: 1500, edited: false });

      // Заказанная книга и сотрудник только на просмотр — не могут открыть редактор фото.
      expect((await call({ method: "GET", url: `/api/v1/books/${BOOK_ORDERED_ID}/photos/${P1_ID}/editor`, headers: asOwner })).statusCode).toBe(409);
      expect((await call({ method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/photos/${P1_ID}/editor`, headers: authOf(STAFF_VIEW) })).statusCode).toBe(404);

      const editBody = {
        version: "v1",
        edit: {
          v: 1,
          geometry: { turns: 1, flip: false, straighten: 0, crop: null, aspect: "free" },
          adjust: { brightness: 15 },
          levels: null,
          filter: { id: "warm", strength: 80 },
          layers: [],
        },
      };
      const saveOk = await call({
        method: "PUT",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/photos/${P1_ID}/editor`,
        headers: { ...asOwner, origin: ORIGIN },
        payload: editBody,
      });
      expect(saveOk.statusCode).toBe(200);
      expect(v1.photoEditorSave.response.parse(saveOk.json()).edited).toBe(true);
      expect(photoRendererPort.renderEdit).toHaveBeenCalledTimes(1);
      expect(photosSvc.saveEdit).toHaveBeenCalledTimes(1);
      expect(limiter.hits).toEqual([`photo-edit:${OWNER.id}`]);

      // Пустая правка при имеющейся — вызывает revertEdit без рендера.
      photosSvc.editState.mockResolvedValueOnce({ edit: { v: 1 } as never, version: "v1" });
      const emptySave = await call({
        method: "PUT",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/photos/${P1_ID}/editor`,
        headers: { ...asOwner, origin: ORIGIN },
        payload: {
          version: "v1",
          edit: {
            v: 1,
            geometry: { turns: 0, flip: false, straighten: 0, crop: null, aspect: "free" },
            adjust: {},
            levels: null,
            filter: { id: "none", strength: 100 },
            layers: [],
          },
        },
      });
      expect(emptySave.statusCode).toBe(200);
      expect(emptySave.json().edited).toBe(false);
      expect(photosSvc.revertEdit).toHaveBeenCalledTimes(1);

      // Конфликт версии → 409 photosOutdated.
      const stale = await call({
        method: "PUT",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/photos/${P1_ID}/editor`,
        headers: { ...asOwner, origin: ORIGIN },
        payload: { ...editBody, version: "old-ver" },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json().code).toBe("photosOutdated");

      // Лимит → 429 photosRate.
      limiter.deny = true;
      const rateHit = await call({
        method: "PUT",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/photos/${P1_ID}/editor`,
        headers: { ...asOwner, origin: ORIGIN },
        payload: editBody,
      });
      expect(rateHit.statusCode).toBe(429);
      limiter.deny = false;

      const revertOk = await call({
        method: "DELETE",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/photos/${P1_ID}/editor`,
        headers: { ...asOwner, origin: ORIGIN },
      });
      expect(revertOk.statusCode).toBe(200);
      expect(v1.photoEditorRevert.response.parse(revertOk.json()).edited).toBe(false);
    });

    it("POST /dictation: распознавание, лимиты 10м/сутки, 400 без файла, 413 >15МБ, 429, 502 и 409", async () => {
      const mp = multipartBody("audio", "voice.m4a", "audio/mp4", "AUDIOBYTES");
      const ok = await call({
        method: "POST",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/dictation`,
        headers: { ...asOwner, origin: ORIGIN, "content-type": `multipart/form-data; boundary=${mp.boundary}` },
        payload: mp.payload,
      });
      expect(ok.statusCode).toBe(200);
      expect(v1.answerDictate.response.parse(ok.json())).toEqual({ text: "Привет, мир!" });
      expect(limiter.hits).toEqual([`dictation:${OWNER.id}`, `dictation-day:${OWNER.id}`]);
      expect(assistantPort.dictate).toHaveBeenCalledWith({
        data: Buffer.from("AUDIOBYTES").toString("base64"),
        mime: "audio/mp4",
        language: "ru",
      });

      limiter.hits.length = 0;
      const wrongField = multipartBody("other", "v.m4a", "audio/mp4", "X");
      const missing = await call({
        method: "POST",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/dictation`,
        headers: { ...asOwner, origin: ORIGIN, "content-type": `multipart/form-data; boundary=${wrongField.boundary}` },
        payload: wrongField.payload,
      });
      expect(missing.statusCode).toBe(400);
      expect(limiter.hits).toEqual([]);

      const tooBig = multipartBody("audio", "big.m4a", "audio/mp4", Buffer.alloc(15 * 1024 * 1024 + 1));
      const bigRes = await call({
        method: "POST",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/dictation`,
        headers: { ...asOwner, origin: ORIGIN, "content-type": `multipart/form-data; boundary=${tooBig.boundary}` },
        payload: tooBig.payload,
      });
      expect(bigRes.statusCode).toBe(413);
      expect(bigRes.json().code).toBe("dictationTooLong");
      expect(limiter.hits).toEqual([]);

      limiter.deny = true;
      const rateRes = await call({
        method: "POST",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/dictation`,
        headers: { ...asOwner, origin: ORIGIN, "content-type": `multipart/form-data; boundary=${mp.boundary}` },
        payload: mp.payload,
      });
      expect(rateRes.statusCode).toBe(429);
      expect(rateRes.json().code).toBe("dictationRate");
      limiter.deny = false;

      assistantPort.dictate.mockResolvedValueOnce({ error: "provider down" });
      const failRes = await call({
        method: "POST",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/dictation`,
        headers: { ...asOwner, origin: ORIGIN, "content-type": `multipart/form-data; boundary=${mp.boundary}` },
        payload: mp.payload,
      });
      expect(failRes.statusCode).toBe(502);
      expect(failRes.json().code).toBe("dictationFailed");

      const lockedRes = await call({
        method: "POST",
        url: `/api/v1/books/${BOOK_ORDERED_ID}/dictation`,
        headers: { ...asOwner, origin: ORIGIN, "content-type": `multipart/form-data; boundary=${mp.boundary}` },
        payload: mp.payload,
      });
      expect(lockedRes.statusCode).toBe(409);
      expect(lockedRes.json().code).toBe("bookLocked");
    });
  });

  describe("letters (6 маршрутов)", () => {
    it("все 6 маршрутов писем: чтение, приглашение, текст, порядок, правка, удаление, ошибки", async () => {
      const getOk = await call({ method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/letters`, headers: asOwner });
      expect(getOk.statusCode).toBe(200);
      const lv = v1.lettersGet.response.parse(getOk.json());
      expect(lv.letters).toHaveLength(2);
      expect(lv.invite.url).toBe(`${ORIGIN}/letters/inv-token-123`);
      expect(lv.editable).toBe(true);

      const inv = await call({
        method: "POST",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/letters/invite`,
        headers: { ...asOwner, origin: ORIGIN },
        payload: { enabled: true, regenerate: true },
      });
      expect(inv.statusCode).toBe(200);
      v1.letterInviteSet.response.parse(inv.json());
      expect(booksSvc.setLetterInvite).toHaveBeenCalledWith(BOOK_DRAFT_ID, expect.objectContaining({ userId: OWNER.id }), true, true);

      const invText = await call({
        method: "PUT",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/letters/invite-text`,
        headers: { ...asOwner, origin: ORIGIN },
        payload: { text: "Напишите тёплые слова!" },
      });
      expect(invText.statusCode).toBe(200);
      expect(booksSvc.updateSettings).toHaveBeenCalledWith(BOOK_DRAFT_ID, expect.objectContaining({ userId: OWNER.id }), { inviteText: "Напишите тёплые слова!" }, photoRepositoryStub);

      const reord = await call({
        method: "PUT",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/letters/order`,
        headers: { ...asOwner, origin: ORIGIN },
        payload: { ids: [L2_ID, L1_ID] },
      });
      expect(reord.statusCode).toBe(200);
      expect(lettersSvc.reorder).toHaveBeenCalledWith(BOOK_DRAFT_ID, expect.objectContaining({ userId: OWNER.id }), [L2_ID, L1_ID]);

      const patchOk = await call({
        method: "PATCH",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/letters/${L1_ID}`,
        headers: { ...asOwner, origin: ORIGIN },
        payload: { status: "approved", authorName: "Дана К." },
      });
      expect(patchOk.statusCode).toBe(200);
      expect(v1.letterUpdate.response.parse(patchOk.json()).letter.id).toBe(L1_ID);
      expect(lettersSvc.edit).toHaveBeenCalledWith(BOOK_DRAFT_ID, expect.objectContaining({ userId: OWNER.id }), L1_ID, { status: "approved", authorName: "Дана К." });

      const delOk = await call({ method: "DELETE", url: `/api/v1/books/${BOOK_DRAFT_ID}/letters/${L2_ID}`, headers: { ...asOwner, origin: ORIGIN } });
      expect(delOk.statusCode).toBe(200);
      expect(delOk.json()).toEqual({ ok: true });
      expect(lettersSvc.delete).toHaveBeenCalledWith(BOOK_DRAFT_ID, expect.objectContaining({ userId: OWNER.id }), L2_ID);

      expect((await call({ method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/letters`, headers: authOf(STRANGER) })).statusCode).toBe(404);
      const wrongLetterMethod = await call({ method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/letters/${L1_ID}`, headers: asOwner });
      expect(wrongLetterMethod.statusCode).toBe(405);
      expect(wrongLetterMethod.headers.allow).toBe("PATCH, DELETE");
    });
  });

  describe("cover (5 маршрутов)", () => {
    it("GET / PATCH / PUT design / POST init / POST reset: валидация, права, 400 и 409", async () => {
      const getOk = await call({ method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/cover`, headers: { ...asOwner, [LOCALE_HEADER]: "kk" } });
      expect(getOk.statusCode).toBe(200);
      const cv = v1.coverGet.response.parse(getOk.json());
      expect(cv.cover.template).toBe("linen");
      expect(cv.designer?.fonts.length).toBeGreaterThan(0);

      const patchOk = await call({
        method: "PATCH",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/cover`,
        headers: { ...asOwner, origin: ORIGIN },
        payload: { title: "Новое название", coverLines: false },
      });
      expect(patchOk.statusCode).toBe(200);
      expect(booksSvc.updateSettings).toHaveBeenCalledWith(BOOK_DRAFT_ID, expect.objectContaining({ userId: OWNER.id }), { title: "Новое название", coverLines: false }, photoRepositoryStub);

      expect((await call({ method: "PATCH", url: `/api/v1/books/${BOOK_ORDERED_ID}/cover`, headers: { ...asOwner, origin: ORIGIN }, payload: { title: "x" } })).statusCode).toBe(409);
      expect((await call({ method: "PATCH", url: `/api/v1/books/${BOOK_DRAFT_ID}/cover`, headers: { ...authOf(STAFF_VIEW), origin: ORIGIN }, payload: { title: "x" } })).statusCode).toBe(404);

      const designSave = await call({
        method: "PUT",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/cover/design`,
        headers: { ...asOwner, origin: ORIGIN },
        payload: {
          coverDesign: { v: 1, background: { kind: "color", color: "#FFFFFF" }, layers: [] },
          coverBack: { v: 1, background: { kind: "template" } },
          photoFrames: [{ key: "cover:0", frame: { zoom: 1.2, x: 0.5, y: 0.5 } }],
        },
      });
      expect(designSave.statusCode).toBe(200);
      expect(booksSvc.updateSettings).toHaveBeenLastCalledWith(
        BOOK_DRAFT_ID,
        expect.anything(),
        expect.objectContaining({ coverBack: null, photoFrames: { "cover:0": { zoom: 1.2, x: 0.5, y: 0.5 } } }),
        photoRepositoryStub,
      );

      const initFront = await call({
        method: "POST",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/cover/design/init`,
        headers: { ...asOwner, origin: ORIGIN },
        payload: { side: "front" },
      });
      expect(initFront.statusCode).toBe(200);

      const initBack = await call({
        method: "POST",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/cover/design/init`,
        headers: { ...asOwner, origin: ORIGIN },
        payload: { side: "back", backLayout: "quote" },
      });
      expect(initBack.statusCode).toBe(200);

      const initBadLayout = await call({
        method: "POST",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/cover/design/init`,
        headers: { ...asOwner, origin: ORIGIN },
        payload: { side: "front", layoutId: "no-such-layout" },
      });
      expect(initBadLayout.statusCode).toBe(400);

      const initBadBack = await call({
        method: "POST",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/cover/design/init`,
        headers: { ...asOwner, origin: ORIGIN },
        payload: { side: "back", backLayout: "no-such-back" },
      });
      expect(initBadBack.statusCode).toBe(400);

      const resetFront = await call({
        method: "POST",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/cover/design/reset`,
        headers: { ...asOwner, origin: ORIGIN },
        payload: { side: "front", coverTemplate: "linen" },
      });
      expect(resetFront.statusCode).toBe(200);
      expect(booksSvc.updateSettings).toHaveBeenLastCalledWith(BOOK_DRAFT_ID, expect.anything(), { coverDesign: null, coverTemplate: "linen" }, photoRepositoryStub);

      const resetBack = await call({
        method: "POST",
        url: `/api/v1/books/${BOOK_DRAFT_ID}/cover/design/reset`,
        headers: { ...asOwner, origin: ORIGIN },
        payload: { side: "back" },
      });
      expect(resetBack.statusCode).toBe(200);
    });
  });

  describe("preview (2 маршрута)", () => {
    it("GET /build и GET /build/progress: ready / building / failed / retry=1 / null / 404 / 405", async () => {
      const ready = await call({ method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/build`, headers: asOwner });
      expect(ready.statusCode).toBe(200);
      expect(v1.bookBuild.response.parse(ready.json())).toMatchObject({ status: "ready", pdfUrl: `/api/books/${BOOK_DRAFT_ID}/preview` });
      expect(previewsPort.build).toHaveBeenCalledWith(BOOK_DRAFT_ID, { retry: false });

      previewsPort.build.mockResolvedValueOnce({ status: "failed", previous: sampleBuild, error: "renderFailed", retryInMs: 45_000 });
      const failed = await call({ method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/build?retry=1`, headers: asOwner });
      expect(failed.statusCode).toBe(200);
      expect(failed.json()).toMatchObject({ status: "failed", error: "renderFailed", retryInMs: 45_000 });
      expect(previewsPort.build).toHaveBeenLastCalledWith(BOOK_DRAFT_ID, { retry: true });

      previewsPort.build.mockResolvedValueOnce(null);
      expect((await call({ method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/build`, headers: asOwner })).statusCode).toBe(404);
      expect((await call({ method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/build?retry=2`, headers: asOwner })).statusCode).toBe(400);

      const prog = await call({ method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/build/progress`, headers: asOwner });
      expect(prog.statusCode).toBe(200);
      expect(v1.bookBuildProgress.response.parse(prog.json())).toEqual({
        progress: { state: "running", stage: "flow", percent: 43, etaMs: 3200, overrun: false, ahead: 0 },
      });

      previewsPort.progressOf.mockReturnValueOnce(null);
      const idle = await call({ method: "GET", url: `/api/v1/books/${BOOK_DRAFT_ID}/build/progress`, headers: asOwner });
      expect(idle.statusCode).toBe(200);
      expect(idle.json()).toEqual({ progress: null });

      expect((await call({ method: "POST", url: `/api/v1/books/${BOOK_DRAFT_ID}/build/progress`, headers: { ...asOwner, origin: ORIGIN } })).statusCode).toBe(405);
    });
  });
});
