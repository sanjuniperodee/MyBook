import type { ApiFetch } from "./api";
import { routeWebToApi } from "./api";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messagesFor } from "@/i18n/messages";
import type { BookRow } from "@/modules/authoring";
import { createWebApiClient, v1WebRead } from "@/server/v1-web-client";
import {
  fromWebBookRow,
  localBookHubDto,
  localBookShellNav,
  localCoverPageDto,
  localLettersPageDto,
  localPagesPageDtoForUser,
  localPhotosPageDtoForUser,
  localPreviewPageDtoForUser,
  localQuestionsPageDtoForUser,
  localVisibleBook,
} from "@/server/v1-local-bridge-book";
import { NotFound, client, egor, fake, resetContainer, resetRequest, signIn, vera } from "../doubles/web";

vi.mock("@/shared/infrastructure/http/request", async (real) => ({ ...(await real<object>()), ...(await import("../doubles/web")).nextHeaders, ...(await import("../doubles/web")).nextNavigation }));
vi.mock("@/server/container", async () => (await import("../doubles/web")).containerModule);
vi.mock("@/server/photoLimit", () => ({ maxPhotos: vi.fn(async () => 120) }));

// ADR 0013: веб ходит только в API v1 — в тестах его запросы обслуживает бэкенд на Nest в этом же процессе.
beforeEach(async () => {
  await routeWebToApi();
});

const { nestApi, legacyAuth } = await import("./api");
const { HttpError } = await import("@/server/api");
const { getAccessibleBook } = await import("@/server/books");
const { bookHub } = await import("@/server/book-hub");

const USER_ID = "11111111-2222-4333-8444-555555555555";
const OTHER_USER_ID = "22222222-3333-4444-8555-666666666666";
const BOOK_ID = "3f2b8c1e-7a4d-4e5f-9b6c-1d2e3f4a5b6c";
const Q1_ID = "4a1b2c3d-1111-4222-8333-444444444444";
const Q2_ID = "5b2c3d4e-1111-4222-8333-555555555555";
const PHOTO1_ID = "6c3d4e5f-1111-4222-8333-666666666666";
const LETTER1_ID = "7d4e5f6a-1111-4222-8333-777777777777";
const ORDER1_ID = "8e5f6a7b-1111-4222-8333-888888888888";

const ownerUser = {
  ...client,
  id: USER_ID,
  email: "owner@mybooks.kz",
  name: "Алия",
  locale: "ru" as const,
};

const foreignUser = {
  ...client,
  id: OTHER_USER_ID,
  email: "other@mybooks.kz",
  name: "Марат",
  locale: "ru" as const,
};

function makeBook(over: Partial<BookRow> = {}): BookRow {
  return {
    id: BOOK_ID,
    userId: USER_ID,
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
    coverPhotoId: PHOTO1_ID,
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

const sampleQuestions = [
  {
    id: Q1_ID,
    bookId: BOOK_ID,
    chapter: "meeting",
    questionKey: "q1",
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
    bookId: BOOK_ID,
    chapter: "meeting",
    questionKey: "q2",
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

const samplePhotos = [
  {
    id: PHOTO1_ID,
    bookId: BOOK_ID,
    questionId: Q1_ID,
    chapter: null,
    opener: false,
    storageKey: "photos/p1-v1.jpg",
    originalName: "p1.jpg",
    mimeType: "image/jpeg",
    width: 1600,
    height: 1200,
    caption: "В парке",
    layout: "full" as const,
    inline: null,
    crop: null,
    edit: null,
    position: 0,
    createdAt: new Date("2026-11-02T10:00:00.000Z"),
    updatedAt: new Date("2026-11-02T10:00:00.000Z"),
  },
];

const sampleLetters = [
  {
    id: LETTER1_ID,
    bookId: BOOK_ID,
    authorName: "Мама",
    relation: "мама",
    text: "Будьте счастливы долгие годы!",
    status: "approved" as const,
    position: 0,
    createdAt: new Date("2026-11-10T12:00:00.000Z"),
    updatedAt: new Date("2026-11-10T12:00:00.000Z"),
  },
];

const sampleOrder = {
  id: ORDER1_ID,
  number: 4201,
  status: "paid" as const,
  plan: "hardcover",
};

function setupBookFixture(opts: { book?: BookRow; order?: typeof sampleOrder | null; screen?: { pageCount: number; contentPages: number; chapterPages: Record<string, number> } | null } = {}) {
  const book = opts.book ?? makeBook();
  const order = opts.order === undefined ? null : opts.order;
  const screen = opts.screen === undefined ? { pageCount: 64, contentPages: 58, chapterPages: { meeting: 7 } } : opts.screen;

  fake.authoring = {
    queries: {
      visibleBook: async (id: string, viewer: { userId: string; isStaff: boolean }) => {
        if (id !== book.id) return null;
        if (viewer.isStaff || viewer.userId === book.userId) return book;
        return null;
      },
      userBooks: async (uid: string) =>
        uid === book.userId
          ? [{ book, answered: 1, total: 2, words: 12, photos: samplePhotos.length }]
          : [],
      stats: async () => ({
        answered: 1,
        total: 2,
        words: 12,
        photos: samplePhotos.length,
        estimatedPages: 58,
        printedPages: 64,
        emptyChapters: 0,
      }),
      questions: async () => sampleQuestions,
      chapters: async () => [],
      photos: async () => samplePhotos,
      letters: async () => sampleLetters,
      approvedLetters: async () => sampleLetters.filter((l) => l.status === "approved"),
      editedPhotoIds: async () => new Set([PHOTO1_ID]),
      bundle: async () => ({ book, questions: sampleQuestions, chapters: [], photos: samplePhotos, letters: sampleLetters }),
    },
  };
  fake.ordering = {
    queries: {
      lastOrderOfBook: async () => order,
    },
    orders: {
      agreementFor: async () => null,
    },
  };
  fake.previews = {
    current: async () => screen,
  };
  fake.assistant = {
    proofreader: { configured: () => true },
    writer: { configured: () => false },
  };
  return book;
}

const fakeAuth = (who: unknown = ownerUser) => ({
  user: async () => {
    if (!who) throw new HttpError(401, "unauthorized");
    return who as never;
  },
  // Сотрудник CRM — с ролью из двойника container() (vera — только clients.view, egor — ещё clients.edit).
  staff: async () => {
    if ((who as { role?: string } | null)?.role !== "admin") throw new HttpError(403, "forbidden");
    return who as never;
  },
});

const call = (app: ApiFetch, method: string, urlPath: string) =>
  app(new Request(`http://127.0.0.1:3044${urlPath}`, { method }));

const makeApiClientForApp = (app: ApiFetch) =>
  createWebApiClient({
    baseUrl: "http://127.0.0.1:3044",
    sessionCookie: ownerUser.id,
    locale: "ru",
    fetch: (input, init) => app(new Request(String(input), init)),
  });

beforeEach(() => {
  resetRequest();
  resetContainer();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("API v1 web-book-pages маршруты (Раздел 2A)", () => {
  it("GET /api/v1/web/books/{bookId}: владелец получает книгу, чужой — 404, гость — 401", async () => {
    setupBookFixture();
    signIn(ownerUser);
    const appOwner = (await nestApi({ auth: legacyAuth(fakeAuth(ownerUser)) }));
    const okRes = await call(appOwner, "GET", `/api/v1/web/books/${BOOK_ID}`);
    expect(okRes.status).toBe(200);
    const body = await okRes.json();
    expect(body.book.id).toBe(BOOK_ID);
    expect(body.book.title).toBe("Наша история");
    expect(body.book.createdAt).toBe("2026-11-01T10:00:00.000Z");

    signIn(foreignUser);
    const appForeign = (await nestApi({ auth: legacyAuth(fakeAuth(foreignUser)) }));
    const notFoundRes = await call(appForeign, "GET", `/api/v1/web/books/${BOOK_ID}`);
    expect(notFoundRes.status).toBe(404);

    const appAnon = (await nestApi({ auth: legacyAuth(fakeAuth(null)) }));
    const unauthRes = await call(appAnon, "GET", `/api/v1/web/books/${BOOK_ID}`);
    expect(unauthRes.status).toBe(401);
  });

  it("GET /api/v1/web/books/{bookId}/nav: для черновика orderState = null, для заказанной — метка и тон заказа", async () => {
    setupBookFixture();
    signIn(ownerUser);
    const app = (await nestApi({ auth: legacyAuth(fakeAuth(ownerUser)) }));

    const draftRes = await call(app, "GET", `/api/v1/web/books/${BOOK_ID}/nav?locale=ru`);
    expect(draftRes.status).toBe(200);
    const draftBody = await draftRes.json();
    expect(draftBody.nav.answered).toBe(1);
    expect(draftBody.nav.total).toBe(2);
    expect(draftBody.nav.letters).toEqual({ approved: 1, pending: 0 });
    expect(draftBody.orderState).toBeNull();

    setupBookFixture({ book: makeBook({ status: "ordered" }), order: sampleOrder });
    const orderedRes = await call(app, "GET", `/api/v1/web/books/${BOOK_ID}/nav?locale=ru`);
    expect(orderedRes.status).toBe(200);
    const orderedBody = await orderedRes.json();
    expect(orderedBody.nav.ordered).toBe(true);
    expect(orderedBody.nav.paid).toBe(true);
    expect(orderedBody.orderState).toEqual({ label: expect.any(String), tone: "success" });
  });

  it("GET /api/v1/web/books/{bookId}/hub: отдаёт штаб книги 1-в-1 с bookHub", async () => {
    setupBookFixture();
    signIn(ownerUser);
    const app = (await nestApi({ auth: legacyAuth(fakeAuth(ownerUser)) }));
    const res = await call(app, "GET", `/api/v1/web/books/${BOOK_ID}/hub?locale=ru`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.printedPages).toBe(64);
    expect(body.rows).toHaveLength(4);
    expect(body.chapters).toHaveLength(1);
    expect(body.photos).toEqual([{ id: PHOTO1_ID, width: 1600, height: 1200 }]);
    expect(body.preview.href).toBe(`/books/${BOOK_ID}/preview`);
  });

  it("GET /api/v1/web/books/{bookId}/pages/questions: учитывает права правки владельца и сотрудников CRM (vera vs egor)", async () => {
    setupBookFixture();
    signIn(ownerUser);
    const appOwner = (await nestApi({ auth: legacyAuth(fakeAuth(ownerUser)) }));
    const ownerRes = await call(appOwner, "GET", `/api/v1/web/books/${BOOK_ID}/pages/questions`);
    expect(ownerRes.status).toBe(200);
    const ownerBody = await ownerRes.json();
    expect(ownerBody.editable).toBe(true);
    expect(ownerBody.proofreadAi).toBe(true);
    expect(ownerBody.writerAi).toBe(false);
    expect(ownerBody.maxPhotos).toBe(120);
    expect(ownerBody.initialQuestions).toHaveLength(2);
    expect(ownerBody.initialPhotos).toHaveLength(1);
    expect(ownerBody.letters).toHaveLength(1);

    // Сотрудник только с clients.view читает, но editable = false
    signIn(vera);
    const appVera = (await nestApi({ auth: legacyAuth(fakeAuth(vera)) }));
    const veraRes = await call(appVera, "GET", `/api/v1/web/books/${BOOK_ID}/pages/questions`);
    expect(veraRes.status).toBe(200);
    expect((await veraRes.json()).editable).toBe(false);

    // Сотрудник с clients.edit может править черновик
    signIn(egor);
    const appEgor = (await nestApi({ auth: legacyAuth(fakeAuth(egor)) }));
    const egorRes = await call(appEgor, "GET", `/api/v1/web/books/${BOOK_ID}/pages/questions`);
    expect(egorRes.status).toBe(200);
    expect((await egorRes.json()).editable).toBe(true);
  });

  it("GET /api/v1/web/books/{bookId}/pages/photos, letters, cover, pages, preview: возвращают полные read-модели", async () => {
    setupBookFixture();
    signIn(ownerUser);
    const app = (await nestApi({ auth: legacyAuth(fakeAuth(ownerUser)) }));

    const photosRes = await call(app, "GET", `/api/v1/web/books/${BOOK_ID}/pages/photos?locale=ru`);
    expect(photosRes.status).toBe(200);
    const photosBody = await photosRes.json();
    expect(photosBody.book.editable).toBe(true);
    expect(photosBody.photos[0].edited).toBe(true);
    expect(photosBody.maxPhotos).toBe(120);
    expect(photosBody.places).toHaveLength(1);

    const lettersRes = await call(app, "GET", `/api/v1/web/books/${BOOK_ID}/pages/letters`);
    expect(lettersRes.status).toBe(200);
    const lettersBody = await lettersRes.json();
    expect(lettersBody.letters).toEqual([
      {
        id: LETTER1_ID,
        authorName: "Мама",
        relation: "мама",
        text: "Будьте счастливы долгие годы!",
        status: "approved",
        createdAt: "2026-11-10T12:00:00.000Z",
      },
    ]);

    const coverRes = await call(app, "GET", `/api/v1/web/books/${BOOK_ID}/pages/cover?locale=ru`);
    expect(coverRes.status).toBe(200);
    const coverBody = await coverRes.json();
    expect(coverBody.pages).toBe(64);
    expect(coverBody.photos).toHaveLength(1);
    expect(coverBody.sample.title).toBe("Наша история");

    const pagesRes = await call(app, "GET", `/api/v1/web/books/${BOOK_ID}/pages/pages?locale=ru`);
    expect(pagesRes.status).toBe(200);
    const pagesBody = await pagesRes.json();
    expect(pagesBody.exactPages).toEqual({ meeting: 7 });
    expect(pagesBody.stories[Q1_ID].title).toBe("Первая встреча");
    expect(pagesBody.photos.maxPhotos).toBe(120);

    const previewRes = await call(app, "GET", `/api/v1/web/books/${BOOK_ID}/pages/preview`);
    expect(previewRes.status).toBe(200);
    const previewBody = await previewRes.json();
    expect(previewBody.editable).toBe(true);
    expect(previewBody.flipbook.title).toBe("Наша история");
    expect(previewBody.flipbook.formatId).toBe("a5");
  });
});

describe("PARITY_MODE=strict, fallback и webApiOnly для section='book'", () => {
  it("все 9 read-моделей проходят строгую сверку parity (local === API v1) без единого расхождения", async () => {
    const book = setupBookFixture();
    signIn(ownerUser);
    const app = (await nestApi({ auth: legacyAuth(fakeAuth(ownerUser)) }));
    const api = makeApiClientForApp(app);
    const m = messagesFor("ru");
    const warn = vi.fn();

    await expect(
      v1WebRead({
        name: "book.accessible",
        section: "book",
        flag: "book",
        parity: "strict",
        client: api,
        logger: { warn },
        local: () => localVisibleBook(BOOK_ID, ownerUser),
        viaApi: async (c) => fromWebBookRow((await c.webBook({ bookId: BOOK_ID })).book),
      }),
    ).resolves.toMatchObject({ id: BOOK_ID, title: "Наша история" });

    await expect(
      v1WebRead({
        name: "book.hub",
        section: "book",
        flag: "book",
        parity: "strict",
        client: api,
        logger: { warn },
        local: () => localBookHubDto(book, "ru", m),
        viaApi: (c) => c.webBookHub({ bookId: BOOK_ID, locale: "ru" }),
      }),
    ).resolves.toMatchObject({ printedPages: 64 });

    await expect(
      v1WebRead({
        name: "book.layoutNav",
        section: "book",
        flag: "book",
        parity: "strict",
        client: api,
        logger: { warn },
        local: () => localBookShellNav(book, "ru"),
        viaApi: (c) => c.webBookNav({ bookId: BOOK_ID, locale: "ru" }),
      }),
    ).resolves.toMatchObject({ orderState: null });

    await expect(
      v1WebRead({
        name: "book.questionsPage",
        section: "book",
        flag: "book",
        parity: "strict",
        client: api,
        logger: { warn },
        local: () => localQuestionsPageDtoForUser(book, ownerUser),
        viaApi: (c) => c.webBookQuestionsPage({ bookId: BOOK_ID }),
      }),
    ).resolves.toMatchObject({ editable: true, maxPhotos: 120 });

    await expect(
      v1WebRead({
        name: "book.photosPage",
        section: "book",
        flag: "book",
        parity: "strict",
        client: api,
        logger: { warn },
        local: () => localPhotosPageDtoForUser(book, ownerUser, m),
        viaApi: (c) => c.webBookPhotosPage({ bookId: BOOK_ID, locale: "ru" }),
      }),
    ).resolves.toMatchObject({ maxPhotos: 120 });

    await expect(
      v1WebRead({
        name: "book.lettersPage",
        section: "book",
        flag: "book",
        parity: "strict",
        client: api,
        logger: { warn },
        local: () => localLettersPageDto(BOOK_ID),
        viaApi: (c) => c.webBookLettersPage({ bookId: BOOK_ID }),
      }),
    ).resolves.toMatchObject({ letters: [{ id: LETTER1_ID }] });

    await expect(
      v1WebRead({
        name: "book.coverPage",
        section: "book",
        flag: "book",
        parity: "strict",
        client: api,
        logger: { warn },
        local: () => localCoverPageDto(book, "ru", m),
        viaApi: (c) => c.webBookCoverPage({ bookId: BOOK_ID, locale: "ru" }),
      }),
    ).resolves.toMatchObject({ pages: 64 });

    await expect(
      v1WebRead({
        name: "book.pagesPage",
        section: "book",
        flag: "book",
        parity: "strict",
        client: api,
        logger: { warn },
        local: () => localPagesPageDtoForUser(book, ownerUser, m),
        viaApi: (c) => c.webBookPagesPage({ bookId: BOOK_ID, locale: "ru" }),
      }),
    ).resolves.toMatchObject({ exactPages: { meeting: 7 } });

    await expect(
      v1WebRead({
        name: "book.previewPage",
        section: "book",
        flag: "book",
        parity: "strict",
        client: api,
        logger: { warn },
        local: () => localPreviewPageDtoForUser(book, ownerUser),
        viaApi: (c) => c.webBookPreviewPage({ bookId: BOOK_ID }),
      }),
    ).resolves.toMatchObject({ editable: true });

    expect(warn).not.toHaveBeenCalled();
  });

  it("getAccessibleBook: при WEB_USE_API_V1=book читает через API и на 404 вызывает notFound() без отката на local()", async () => {
    setupBookFixture();
    signIn(ownerUser);
    const app = (await nestApi({ auth: legacyAuth(fakeAuth(ownerUser)) }));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => app(new Request(String(input), init)));

    try {
      vi.stubEnv("WEB_USE_API_V1", "book");
      vi.stubEnv("API_INTERNAL_URL", "http://127.0.0.1:3044");
      vi.stubEnv("PARITY_MODE", "off");

      const book = await getAccessibleBook(BOOK_ID, ownerUser);
      expect(book.id).toBe(BOOK_ID);
      expect(book.createdAt).toBeInstanceOf(Date);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // 404 от API v1 не откатывается к локальному фолбэку, а сразу даёт notFound()
      const missingId = "99999999-9999-4999-8999-999999999999";
      await expect(getAccessibleBook(missingId, ownerUser)).rejects.toBeInstanceOf(NotFound);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("bookHub работает через API v1 (ADR 0013: отката на local() у веба нет; страницы веба — в mybook-web)", async () => {
    const book = setupBookFixture();
    signIn(ownerUser);
    const app = (await nestApi({ auth: legacyAuth(fakeAuth(ownerUser)) }));
    const m = messagesFor("ru");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => app(new Request(String(input), init)));

    try {
      vi.stubEnv("WEB_USE_API_V1", "book");
      vi.stubEnv("API_INTERNAL_URL", "http://127.0.0.1:3044");
      vi.stubEnv("PARITY_MODE", "off");

      const hub = await bookHub(book, "ru", m);
      expect(hub.printedPages).toBe(64);
      expect(hub.sectionHref(Q1_ID)).toBe(`/books/${BOOK_ID}/questions?s=${Q1_ID}`);


    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("v1-local-bridge-book.ts, books.ts и book-hub.ts не имеют статических импортов container/modules/БД (готовы для Vercel WEB_API_ONLY)", () => {
    const root = path.join(__dirname, "..", "..");
    for (const rel of ["src/server/v1-local-bridge-book.ts", "src/server/books.ts", "src/server/book-hub.ts"]) {
      const src = readFileSync(path.join(root, rel), "utf8");
      const staticForbidden: string[] = [];
      for (const match of src.matchAll(/^import\s+(type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']/gm)) {
        if (match[1]) continue;
        if (/^(\.\/container|\.\.?\/server\/container|@\/server\/container|@\/modules\/|\.?\/access|\.?\/photoLimit|pg$|drizzle-orm)/.test(match[3])) {
          staticForbidden.push(match[3]);
        }
      }
      expect(staticForbidden, `${rel} содержит статический импорт БД/модуля`).toEqual([]);
    }
  });
});
