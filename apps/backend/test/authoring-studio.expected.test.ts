import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, describe, it, vi } from "vitest";
import { applyCatalog } from "@/config/site";
import { LOCALE_HEADER } from "@/i18n/config";
import { FILE_CHUNK_BYTES } from "@/lib/book/answer-files";
import type { SampleTocCandidate } from "@/lib/book/toc";
import { AuthoringError, type BookRow, type BookViewer, type QuestionRow } from "@/modules/authoring";
import type { KaspiInvoiceLike } from "@/modules/authoring/ui/answer-media-view";
import { buildStudioChapters, type PagesSampleMeta } from "@/modules/authoring/ui/pages-view";
import { OrderingError } from "@/modules/ordering";
import type { AnswerFileRow } from "@/shared/infrastructure/db/schema";
import {
  ANSWER_FILES_PORTS,
  PAGES_PORTS,
  type AnswerFilesPorts,
  type OwnedMediaPurchase,
  type PagesAiRunResult,
  type PagesPorts,
} from "../src/modules/authoring-studio/authoring-studio.tokens";
import { CABINET_BOOK_PORTS } from "../src/modules/identity/identity.tokens";
import { bootTestApp, sessionOf, testUser, type FakeLimiter } from "./app";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const STRANGER_ID = "22222222-2222-4222-8222-222222222222";
const BOOK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUESTION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FILE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PURCHASE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const INVOICE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const FIXED_MEDIA_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const OWNER = testUser(OWNER_ID, { name: "Айгерим", phone: "+77011112233", locale: "ru" });
const STRANGER = testUser(STRANGER_ID, { name: "Чужой", locale: "ru" });

const ORIGIN = { origin: "http://localhost:3000" };
const asOwner = { cookie: `mb_session=${sessionOf(OWNER)}` };
const asStranger = { cookie: `mb_session=${sessionOf(STRANGER)}` };

const baseBook: BookRow = {
  id: BOOK_ID,
  userId: OWNER_ID,
  theme: "mom",
  status: "draft",
  title: "Книга о маме",
  subtitle: "История семьи",
  authorName: "Айгерим",
  authorGender: "f",
  recordedBy: "",
  recipientName: "Мама",
  recipientGender: "f",
  namesOnCover: "",
  hideRecipientOnCover: false,
  coverLines: true,
  coverTemplate: "classic",
  coverPhotoId: null,
  coverPhotoExtra: [],
  backText: "",
  backLayout: "quote",
  backPhotoId: null,
  backPhotoExtra: [],
  photoFrames: {},
  dedication: "Любимой маме",
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
  inviteToken: null,
  inviteText: "",
  endText: null,
  chapterStart: "page",
  titlePage: true,
  language: "ru",
  occasion: null,
  occasionDate: null,
  createdAt: new Date("2026-10-01T10:00:00Z"),
  updatedAt: new Date("2026-11-20T10:00:00Z"),
};

const baseQuestion: QuestionRow = {
  id: QUESTION_ID,
  bookId: BOOK_ID,
  chapter: "childhood",
  questionKey: null,
  position: 0,
  prompt: "Как прошло детство?",
  hint: null,
  title: "Ранние годы",
  displayText: null,
  hideHeading: false,
  answer: "Первый абзац истории.\n\nВторой абзац истории.",
  media: [{ id: "m1", kind: "video", url: "https://mybooks.kz/v/AbCdEf1234", fileId: FILE_ID, title: "Ролик", anchor: null }],
  pageBreak: false,
  createdAt: new Date("2026-10-01T10:00:00Z"),
  updatedAt: new Date("2026-11-20T10:00:00Z"),
};

const baseFile: AnswerFileRow = {
  id: FILE_ID,
  token: "AbCdEf1234",
  bookId: BOOK_ID,
  userId: OWNER_ID,
  kind: "video",
  status: "uploading",
  name: "clip.mp4",
  sourceMime: "video/mp4",
  sourceBytes: 2048,
  receivedBytes: 512,
  durationSec: null,
  declaredSec: 30,
  width: null,
  height: null,
  bytes: null,
  hasPoster: false,
  error: null,
  attempts: 0,
  lockedAt: null,
  readyAt: null,
  createdAt: new Date("2026-11-20T10:00:00Z"),
  updatedAt: new Date("2026-11-20T10:00:00Z"),
};

const tocFixture: SampleTocCandidate[] = [
  { key: "c:ch1", pageKey: "ch1", kind: "chapter", number: 1, label: "Детство", first: true, epigraph: "Светлые дни", page: 5 },
  { key: "q:q1", pageKey: "q:q1", kind: "section", number: null, label: "Дом", parent: "c:ch1", page: 6 },
  { key: "c:ch2", pageKey: "ch2", kind: "chapter", number: 2, label: "Юность", page: 12 },
  { key: "q:q2", pageKey: "q:q2", kind: "section", number: null, label: "Школа", parent: "c:ch2", page: 13 },
];

const sampleMeta: PagesSampleMeta = {
  version: "abcd1234ef567890",
  spreads: ["chapter", "photos", "front", "toc"],
  allSpreads: ["chapter", "photos", "front", "toc"],
  imageWidths: [600, 1200],
};

const invoiceFixture: KaspiInvoiceLike = {
  id: INVOICE_ID,
  method: "qr",
  status: "pending",
  amount: 2990,
  phone: null,
  link: "https://kaspi.kz/pay/demo",
  qrSvg: "<svg></svg>",
  expiresAt: "2026-11-26T10:15:00.000Z",
  paidAt: null,
};

const purchaseFixture: OwnedMediaPurchase = {
  id: PURCHASE_ID,
  bookId: BOOK_ID,
  userId: OWNER_ID,
  number: 42,
  minutes: 30,
  amount: 2990,
};

const quotaFixture = { minutes: 30, usedSec: 120, leftSec: 1680, files: 1, maxFiles: 40 };
const packsFixture = [{ id: "pack-30", minutes: 30, price: 2990, featured: true }];

const shared = vi.hoisted(() => ({
  book: null as unknown as BookRow,
  question: null as unknown as QuestionRow,
  file: null as AnswerFileRow | null,
  purchase: null as OwnedMediaPurchase | null,
  allowRate: true,
  aiInfo: { allowance: { remaining: 5, limit: 5, credits: 0 }, hasPhotos: true },
  aiResult: null as unknown as PagesAiRunResult,
  aiError: null as unknown,
  startError: null as unknown,
  chunkError: null as unknown,
  kaspiError: null as unknown,
  invoiceStatus: null as unknown as KaspiInvoiceLike,
}));

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomUUID: () => FIXED_MEDIA_ID };
});
vi.mock("@/server/books", () => ({
  viewerOf: async (user: { id: string }): Promise<BookViewer> => ({ userId: user.id, isStaff: false, staffEdits: false }),
}));
vi.mock("@/server/pages-image", () => ({
  pagesSampleOf: async (bookId: string) =>
    bookId === BOOK_ID
      ? {
          bundle: { book: shared.book, questions: [shared.question], chapters: [], photos: [], letters: [] },
          muted: { title: false, toc: false, dedication: false },
        }
      : null,
  pagesSpreadsOf: () => [...sampleMeta.spreads],
  storePagesPreview: async () => "prev1234567890ab",
}));
vi.mock("@/modules/production", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/production")>();
  return { ...actual, pagesVersion: () => sampleMeta.version };
});
vi.mock("@/server/spreadSample", () => ({
  bookSpreadSample: () => ({ tocAll: tocFixture }),
}));
vi.mock("@/server/design-ai-request", () => ({
  designAiInfo: async () => ({ ...shared.aiInfo, packs: [], theme: shared.book.theme }),
  runDesignAiRequest: async () => {
    if (shared.aiError) throw shared.aiError;
    return shared.aiResult;
  },
}));
vi.mock("@/server/answerFiles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/answerFiles")>();
  return {
    ...actual,
    bookFileQuota: async () => quotaFixture,
    listBookFiles: async () => (shared.file ? [shared.file] : []),
    findBookFile: async (_bookId: string, fileId: string) => (shared.file && shared.file.id === fileId ? shared.file : null),
    mediaPackOffers: async () => packsFixture,
    startUpload: async () => {
      if (shared.startError) throw shared.startError;
      return shared.file ?? baseFile;
    },
    appendChunk: async (_file: AnswerFileRow, offset: number, bytes: Buffer) => {
      if (shared.chunkError) throw shared.chunkError;
      return offset + bytes.length;
    },
    finishUpload: async (file: AnswerFileRow) => ({ ...file, status: "queued" as const }),
    removeFile: async () => {},
    createMediaPurchase: async () => purchaseFixture,
    findMediaPurchase: async (id: string) => (shared.purchase && shared.purchase.id === id ? shared.purchase : null),
  };
});
vi.mock("@/server/answerFilesWorker", () => ({ kickAnswerFiles: () => {} }));
vi.mock("@/server/catalog", () => ({ ensureCatalog: async () => {}, syncCatalogFromSettings: async () => {} }));
vi.mock("@/server/kaspi-view", () => ({
  kaspiPaymentProps: async (_target: unknown, defaultPhone: string) => ({ defaultPhone, initial: invoiceFixture }),
  invoiceView: async (inv: KaspiInvoiceLike) => inv,
}));
vi.mock("@/server/rateLimit", () => ({
  rateLimit: async () => shared.allowRate,
  trustedClientIp: async () => "203.0.113.10",
}));
vi.mock("@/server/container", () => ({
  container: () => ({
    clock: { now: () => new Date("2026-11-26T10:00:00Z") },
    identity: {
      tokens: { hash: (t: string) => t },
      queries: {
        userBySession: async (token: string) =>
          token === sessionOf(OWNER) ? OWNER : token === sessionOf(STRANGER) ? STRANGER : null,
        touch: async () => {},
      },
    },
    authoring: {
      photoRepository: {},
      queries: {
        book: async (bookId: string) => (bookId === shared.book.id ? shared.book : null),
        visibleBook: async (bookId: string, viewer: BookViewer) =>
          bookId === shared.book.id && (shared.book.userId === viewer.userId || viewer.isStaff) ? shared.book : null,
        bundle: async (bookId: string) =>
          bookId === shared.book.id
            ? { book: shared.book, questions: [shared.question], chapters: [], photos: [], letters: [] }
            : null,
        questions: async (bookId: string) => (bookId === shared.book.id ? [shared.question] : []),
        chapters: async () => [],
        photos: async () => [],
        approvedLetters: async () => [],
      },
      books: {
        updateSettings: async () => {},
      },
      questions: {
        moveChapter: async () => {},
        edit: async () => {},
      },
    },
    ordering: {
      kaspi: {
        available: async () => true,
        payMediaPack: async () => {
          if (shared.kaspiError) throw shared.kaspiError;
          return invoiceFixture;
        },
        status: async () => shared.invoiceStatus,
      },
    },
  }),
}));

const { assertRoute } = await import("./expected");

function multipartChunk(fieldName: string, content: Buffer, filename = "chunk.bin") {
  const boundary = "----MyBookParityBoundary987654321";
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    body: Buffer.concat([head, content, tail]),
  };
}

let app: NestFastifyApplication;
let limiter: FakeLimiter;

beforeAll(async () => {
  const pagesPort: PagesPorts = {
    book: async (id) => (id === shared.book.id ? shared.book : null),
    sampleMeta: async (id) => (id === BOOK_ID ? sampleMeta : null),
    studioChapters: async () =>
      buildStudioChapters({ book: shared.book, questions: [shared.question], chapters: [], photos: [] }),
    chapterCandidates: async () => tocFixture,
    updateSettings: async () => {},
    moveChapter: async () => {},
    aiInfo: async () => shared.aiInfo,
    runAi: async () => {
      if (shared.aiError) throw shared.aiError;
      return shared.aiResult;
    },
    storePreview: async () => "prev1234567890ab",
  };

  const answerFilesPort: AnswerFilesPorts = {
    questions: async (bookId) => (bookId === shared.book.id ? [shared.question] : []),
    editQuestionMedia: async () => {},
    bookFileQuota: async () => quotaFixture,
    listBookFiles: async () => (shared.file ? [shared.file] : []),
    findBookFile: async (_bookId, fileId) => (shared.file && shared.file.id === fileId ? shared.file : null),
    mediaPackOffers: async () => packsFixture,
    kaspiAvailable: async () => true,
    startUpload: async () => {
      if (shared.startError) throw shared.startError;
      return shared.file ?? baseFile;
    },
    appendChunk: async (_file, offset, bytes) => {
      if (shared.chunkError) throw shared.chunkError;
      return offset + bytes.length;
    },
    finishUpload: async (file) => ({ ...file, status: "queued" }),
    kickWorker: () => {},
    removeFile: async () => {},
    ensureCatalog: async () => {},
    createMediaPurchase: async () => purchaseFixture,
    findMediaPurchase: async (id) => (shared.purchase && shared.purchase.id === id ? shared.purchase : null),
    kaspiPaymentProps: async (_id, defaultPhone) => ({ defaultPhone, initial: invoiceFixture }),
    payMediaPack: async () => {
      if (shared.kaspiError) throw shared.kaspiError;
      return invoiceFixture;
    },
    kaspiStatus: async () => shared.invoiceStatus,
  };

  ({ app, limiter } = await bootTestApp({
    users: [OWNER, STRANGER],
    overrides: [
      [
        CABINET_BOOK_PORTS,
        {
          bookOwnership: async () => ({ managerId: null }),
          visibleBook: async (bookId: string, viewer: BookViewer) =>
            bookId === shared.book.id && (shared.book.userId === viewer.userId || viewer.isStaff) ? shared.book : null,
          shelfBooks: async () => [],
          bookHub: async () => {
            throw new Error("unused");
          },
          photosTab: async () => {
            throw new Error("unused");
          },
          helpThread: async () => ({ enabled: false, whatsapp: "", messages: [], hints: [] }),
          helpAsk: async () => ({ outcome: "answered", suggestions: [], messages: [] }),
        },
      ],
      [PAGES_PORTS, pagesPort],
      [ANSWER_FILES_PORTS, answerFilesPort],
    ],
  }));
});

afterAll(async () => {
  applyCatalog(null);
  await app.close();
});

beforeEach(() => {
  vi.unstubAllGlobals();
  applyCatalog({ mediaPacks: { small: { hidden: false, price: 1990, minutes: 30 } } });
  limiter.hits.length = 0;
  limiter.deny = false;
  shared.book = { ...baseBook };
  shared.question = { ...baseQuestion };
  shared.file = { ...baseFile };
  shared.purchase = { ...purchaseFixture };
  shared.allowRate = true;
  shared.aiInfo = { allowance: { remaining: 5, limit: 5, credits: 0 }, hasPhotos: true };
  shared.aiResult = {
    reply: "Обновил оформление",
    concept: "Тёплая классика",
    changed: true,
    patch: { interior: "warm", interiorStyle: { body: { size: 11 } } },
  };
  shared.aiError = null;
  shared.startError = null;
  shared.chunkError = null;
  shared.kaspiError = null;
  shared.invoiceStatus = { ...invoiceFixture, status: "paid", paidAt: "2026-11-26T10:02:00.000Z" };
});

describe("ответы Nest байт в байт (эталон — прежний mybook-api) (Контекст 2B — все 19 маршрутов)", () => {
  it("pagesGet, pagesUpdate, pagesStudioGet, pagesStudioApply совпадают байт в байт", async () => {
    const pagesUrl = `/api/v1/books/${BOOK_ID}/pages`;
    const studioUrl = `/api/v1/books/${BOOK_ID}/pages/studio`;

    // pagesGet: 200 (ru + kk + ETag/304), 401, 404, 405
    await assertRoute({ nest: app, method: "GET", url: pagesUrl, headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: pagesUrl, headers: { ...asOwner, [LOCALE_HEADER]: "kk" } });
    await assertRoute({ nest: app, method: "GET", url: pagesUrl });
    await assertRoute({ nest: app, method: "GET", url: pagesUrl, headers: asStranger });
    await assertRoute({ nest: app, method: "DELETE", url: pagesUrl, headers: asOwner });

    // pagesUpdate: 200, 400 (interior/fontPair/styleJson), 403 Origin, 409 bookLocked
    await assertRoute({
      nest: app,
      method: "PATCH",
      url: pagesUrl,
      headers: { ...asOwner, ...ORIGIN },
      body: { interior: "minimal", dedication: "Маме" },
    });
    await assertRoute({
      nest: app,
      method: "PATCH",
      url: pagesUrl,
      headers: { ...asOwner, ...ORIGIN },
      body: { interior: "unknown" },
    });
    await assertRoute({
      nest: app,
      method: "PATCH",
      url: pagesUrl,
      headers: { ...asOwner, origin: "https://evil.example" },
      body: { showToc: false },
    });

    shared.book = { ...baseBook, status: "ordered" };
    await assertRoute({
      nest: app,
      method: "PATCH",
      url: pagesUrl,
      headers: { ...asOwner, ...ORIGIN },
      body: { showToc: false },
    });
    shared.book = { ...baseBook };

    // pagesStudioGet: все 5 вкладок + 400
    for (const tab of ["text", "elements", "colors", "chapters", "fonts"]) {
      await assertRoute({ nest: app, method: "GET", url: `${studioUrl}?tab=${tab}`, headers: asOwner });
    }
    await assertRoute({ nest: app, method: "GET", url: `${studioUrl}?tab=bad`, headers: asOwner });

    // pagesStudioApply: 200 + 400 broken json
    await assertRoute({
      nest: app,
      method: "POST",
      url: studioUrl,
      headers: { ...asOwner, ...ORIGIN },
      body: { tab: "text", chapter: null, ops: [{ target: "style", section: "body", key: "size", json: "11.5" }] },
    });
    await assertRoute({
      nest: app,
      method: "POST",
      url: studioUrl,
      headers: { ...asOwner, ...ORIGIN },
      body: { tab: "text", chapter: null, ops: [{ target: "style", section: "body", key: "size", json: "{bad" }] },
    });
  });

  it("pagesAiInfo, pagesAi, pagesChapters, pagesChaptersUpdate совпадают байт в байт", async () => {
    const aiUrl = `/api/v1/books/${BOOK_ID}/pages/ai`;
    const chUrl = `/api/v1/books/${BOOK_ID}/pages/chapters`;

    // pagesAiInfo
    await assertRoute({ nest: app, method: "GET", url: aiUrl, headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: aiUrl, headers: { ...asOwner, [LOCALE_HEADER]: "kk" } });

    // pagesAi: edit, variants, review, 402
    await assertRoute({
      nest: app,
      method: "POST",
      url: aiUrl,
      headers: { ...asOwner, ...ORIGIN },
      body: { mode: "edit", prompt: "Сделай теплее", history: [] },
    });

    shared.aiResult = {
      reply: "Варианты готовы",
      variants: [{ name: "Классика", idea: "Чистая вёрстка", patch: { interior: "classic", interiorStyle: {} } }],
    };
    await assertRoute({
      nest: app,
      method: "POST",
      url: aiUrl,
      headers: { ...asOwner, ...ORIGIN },
      body: { mode: "variants", prompt: "", history: [] },
    });

    shared.aiResult = {
      score: 8,
      summary: "Хороший баланс",
      strengths: ["Читаемый шрифт"],
      tips: [{ title: "Интерлиньяж", why: "Чуть свободнее", patch: { interior: "classic", interiorStyle: { body: { lineHeight: 1.5 } } } }],
    };
    await assertRoute({
      nest: app,
      method: "POST",
      url: aiUrl,
      headers: { ...asOwner, ...ORIGIN },
      body: { mode: "review", prompt: "Оцени", history: [] },
    });

    shared.aiError = Object.assign(new Error("designAiLimit"), { [Symbol.for("mybook.http-error")]: true, status: 402, code: "designAiLimit" });
    await assertRoute({
      nest: app,
      method: "POST",
      url: aiUrl,
      headers: { ...asOwner, ...ORIGIN },
      body: { mode: "edit", prompt: "Сделай теплее", history: [] },
    });
    shared.aiError = null;

    // pagesChapters + pagesChaptersUpdate
    await assertRoute({ nest: app, method: "GET", url: chUrl, headers: asOwner });
    await assertRoute({
      nest: app,
      method: "POST",
      url: chUrl,
      headers: { ...asOwner, ...ORIGIN },
      body: { key: "c:ch2", title: "Молодость", tocMode: "both" },
    });
    await assertRoute({
      nest: app,
      method: "POST",
      url: chUrl,
      headers: { ...asOwner, ...ORIGIN },
      body: { key: "ch2", move: "up" },
    });
  });

  it("answerMediaGet, answerMediaSave, answerMediaAddLink совпадают байт в байт", async () => {
    const mediaUrl = `/api/v1/books/${BOOK_ID}/questions/${QUESTION_ID}/media`;
    const linkUrl = `${mediaUrl}/link`;

    await assertRoute({ nest: app, method: "GET", url: mediaUrl, headers: asOwner });
    await assertRoute({
      nest: app,
      method: "GET",
      url: `/api/v1/books/${BOOK_ID}/questions/99999999-9999-4999-8999-999999999999/media`,
      headers: asOwner,
    });

    await assertRoute({
      nest: app,
      method: "PUT",
      url: mediaUrl,
      headers: { ...asOwner, ...ORIGIN },
      body: { media: [{ id: "m1", kind: "music", url: "https://open.spotify.com/track/123", title: "Трек", anchor: null }] },
    });

    // answerMediaAddLink: 200 (Spotify) + 400 badUrl + 400 duplicate
    await assertRoute({
      nest: app,
      method: "POST",
      url: linkUrl,
      headers: { ...asOwner, ...ORIGIN },
      body: { url: "https://open.spotify.com/track/456" },
    });
    await assertRoute({
      nest: app,
      method: "POST",
      url: linkUrl,
      headers: { ...asOwner, ...ORIGIN },
      body: { url: "not-a-valid-url" },
    });
    await assertRoute({
      nest: app,
      method: "POST",
      url: linkUrl,
      headers: { ...asOwner, ...ORIGIN },
      body: { url: "https://mybooks.kz/v/AbCdEf1234" },
    });
  });

  it("answerFileStart, Status, Chunk, Finish, Delete и пакеты Kaspi (3 маршрута) совпадают байт в байт", async () => {
    const startUrl = `/api/v1/books/${BOOK_ID}/files`;
    const fileUrl = `/api/v1/books/${BOOK_ID}/files/${FILE_ID}`;
    const chunkUrl = `${fileUrl}/chunk?offset=0`;
    const finishUrl = `${fileUrl}/finish`;
    const buyUrl = `/api/v1/books/${BOOK_ID}/files/packs`;
    const kaspiUrl = `/api/v1/books/${BOOK_ID}/files/packs/${PURCHASE_ID}/kaspi`;
    const kaspiStatusUrl = `${kaspiUrl}/${INVOICE_ID}`;

    // answerFileStart: 200, 429, 415 fileType
    await assertRoute({
      nest: app,
      method: "POST",
      url: startUrl,
      headers: { ...asOwner, ...ORIGIN },
      body: { name: "clip.mp4", size: 2048, type: "video/mp4", durationSec: 30 },
    });

    limiter.deny = true;
    shared.allowRate = false;
    await assertRoute({
      nest: app,
      method: "POST",
      url: startUrl,
      headers: { ...asOwner, ...ORIGIN },
      body: { name: "clip.mp4", size: 2048, type: "video/mp4", durationSec: 30 },
    });
    limiter.deny = false;
    shared.allowRate = true;

    shared.startError = new AuthoringError("fileType");
    await assertRoute({
      nest: app,
      method: "POST",
      url: startUrl,
      headers: { ...asOwner, ...ORIGIN },
      body: { name: "doc.pdf", size: 2048, type: "application/pdf", durationSec: null },
    });
    shared.startError = null;

    // answerFileStatus: 200 (ETag/304) + 404
    await assertRoute({ nest: app, method: "GET", url: fileUrl, headers: asOwner });
    shared.file = null;
    await assertRoute({ nest: app, method: "GET", url: fileUrl, headers: asOwner });
    shared.file = { ...baseFile };

    // answerFileChunk: 200 multipart + 400 non-multipart + 400 empty + 413 too big + 409 conflict
    const okPart = multipartChunk("chunk", Buffer.from("0123456789abcdef"));
    await assertRoute({
      nest: app,
      method: "PUT",
      url: chunkUrl,
      headers: { ...asOwner, ...ORIGIN, ...okPart.headers },
      body: okPart.body,
    });
    await assertRoute({
      nest: app,
      method: "PUT",
      url: chunkUrl,
      headers: { ...asOwner, ...ORIGIN },
      body: { bad: true },
    });
    const emptyPart = multipartChunk("chunk", Buffer.alloc(0));
    await assertRoute({
      nest: app,
      method: "PUT",
      url: chunkUrl,
      headers: { ...asOwner, ...ORIGIN, ...emptyPart.headers },
      body: emptyPart.body,
    });
    const bigPart = multipartChunk("chunk", Buffer.alloc(FILE_CHUNK_BYTES + 1));
    await assertRoute({
      nest: app,
      method: "PUT",
      url: chunkUrl,
      headers: { ...asOwner, ...ORIGIN, ...bigPart.headers },
      body: bigPart.body,
    });
    shared.chunkError = new AuthoringError("fileChunk");
    await assertRoute({
      nest: app,
      method: "PUT",
      url: chunkUrl,
      headers: { ...asOwner, ...ORIGIN, ...okPart.headers },
      body: okPart.body,
    });
    shared.chunkError = null;

    // answerFileFinish + answerFileDelete
    await assertRoute({ nest: app, method: "POST", url: finishUrl, headers: { ...asOwner, ...ORIGIN } });
    await assertRoute({ nest: app, method: "DELETE", url: fileUrl, headers: { ...asOwner, ...ORIGIN } });

    // answerFilePackBuy: 200 + 404 unknown pack + 429
    await assertRoute({
      nest: app,
      method: "POST",
      url: buyUrl,
      headers: { ...asOwner, ...ORIGIN },
      body: { packId: "small" },
    });
    await assertRoute({
      nest: app,
      method: "POST",
      url: buyUrl,
      headers: { ...asOwner, ...ORIGIN },
      body: { packId: "missing-pack" },
    });

    // answerFilePackKaspi: 200 + 404 foreign purchase + 503 kaspiNotConnected
    await assertRoute({
      nest: app,
      method: "POST",
      url: kaspiUrl,
      headers: { ...asOwner, ...ORIGIN },
      body: { method: "qr", phone: "" },
    });
    shared.kaspiError = new OrderingError("kaspiNotConnected");
    await assertRoute({
      nest: app,
      method: "POST",
      url: kaspiUrl,
      headers: { ...asOwner, ...ORIGIN },
      body: { method: "qr", phone: "" },
    });
    shared.kaspiError = null;
    shared.purchase = { ...purchaseFixture, userId: STRANGER_ID };
    await assertRoute({
      nest: app,
      method: "POST",
      url: kaspiUrl,
      headers: { ...asOwner, ...ORIGIN },
      body: { method: "qr", phone: "" },
    });
    shared.purchase = { ...purchaseFixture };

    // answerFilePackKaspiStatus: 200 (ETag/304) + 404 + 405
    await assertRoute({ nest: app, method: "GET", url: kaspiStatusUrl, headers: asOwner });
    await assertRoute({ nest: app, method: "POST", url: kaspiStatusUrl, headers: asOwner });
  });
});
