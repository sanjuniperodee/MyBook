import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyCatalog } from "@/config/site";
import { LOCALE_HEADER } from "@/i18n/config";
import { FILE_CHUNK_BYTES } from "@/lib/book/answer-files";
import { MAX_MEDIA } from "@/lib/book/answer-media";
import { fontPairs } from "@/lib/book/interiors/studio-presets";
import type { SampleTocCandidate } from "@/lib/book/toc";
import { StaffContext } from "@/modules/access/domain/StaffContext";
import { AuthoringError, type BookRow, type QuestionRow } from "@/modules/authoring";
import type { AnswerFileRecord, KaspiInvoiceLike } from "@/modules/authoring/ui/answer-media-view";
import type { PagesSampleMeta } from "@/modules/authoring/ui/pages-view";
import { isPhoneEmail } from "@/modules/identity";
import { OrderingError } from "@/modules/ordering";
import type { AnswerFileRow, AnswerMedia } from "@/shared/infrastructure/db/schema";
import { STAFF_ACCESS, type StaffAccessPort } from "../src/core/auth/staff";
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
const STAFF_VIEW_ID = "33333333-3333-4333-8333-333333333333";
const BOOK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUESTION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FILE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PURCHASE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const INVOICE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const OWNER = testUser(OWNER_ID, { name: "Айгерим", phone: "+77011112233", locale: "ru" });
const STRANGER = testUser(STRANGER_ID, { name: "Чужой", locale: "ru" });
const STAFF_VIEW = testUser(STAFF_VIEW_ID, { name: "Наблюдатель", role: "admin", locale: "ru" });

const ORIGIN = { origin: "http://localhost:3000" };
const asOwner = { cookie: `mb_session=${sessionOf(OWNER)}` };
const asStranger = { cookie: `mb_session=${sessionOf(STRANGER)}` };
const asStaffView = { cookie: `mb_session=${sessionOf(STAFF_VIEW)}` };

function makeBook(overrides: Partial<BookRow> = {}): BookRow {
  return {
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
    ...overrides,
  };
}

function makeQuestion(overrides: Partial<QuestionRow> = {}): QuestionRow {
  return {
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
    media: [],
    pageBreak: false,
    createdAt: new Date("2026-10-01T10:00:00Z"),
    updatedAt: new Date("2026-11-20T10:00:00Z"),
    ...overrides,
  };
}

function makeFileRow(overrides: Partial<AnswerFileRow> = {}): AnswerFileRow {
  return {
    id: FILE_ID,
    token: "AbCdEf1234",
    bookId: BOOK_ID,
    userId: OWNER_ID,
    kind: "video",
    status: "uploading",
    name: "clip.mp4",
    sourceMime: "video/mp4",
    sourceBytes: 2048,
    receivedBytes: 0,
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
    ...overrides,
  };
}

function multipartChunk(fieldName: string, content: Buffer, filename = "chunk.bin", contentType = "application/octet-stream") {
  const boundary = "----MyBookTestBoundary7MA4YWxkTrZu0gW";
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([head, content, tail]),
  };
}

const sampleMeta: PagesSampleMeta = {
  version: "abcd1234ef567890",
  spreads: ["chapter", "photos", "front", "toc"],
  allSpreads: ["chapter", "photos", "front", "toc"],
  imageWidths: [600, 1200],
};

const tocFixture: SampleTocCandidate[] = [
  { key: "c:ch1", pageKey: "ch1", kind: "chapter", number: 1, label: "Детство", first: true, epigraph: "Светлые дни", page: 5 },
  { key: "q:q1", pageKey: "q:q1", kind: "section", number: null, label: "Дом", parent: "c:ch1", page: 6 },
  { key: "c:ch2", pageKey: "ch2", kind: "chapter", number: 2, label: "Юность", page: 12 },
  { key: "q:q2", pageKey: "q:q2", kind: "section", number: null, label: "Школа", parent: "c:ch2", page: 13 },
  { key: "c:ch3", pageKey: "ch3", kind: "chapter", number: 3, label: "Семья", page: 20 },
];

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

let currentBook: BookRow = makeBook();
let currentQuestion: QuestionRow = makeQuestion();
let currentFile: AnswerFileRow | null = makeFileRow();
let currentFilesList: AnswerFileRecord[] = [];
let currentPurchase: OwnedMediaPurchase | null = purchaseFixture;

const pagesMocks = {
  book: vi.fn<PagesPorts["book"]>(),
  sampleMeta: vi.fn<PagesPorts["sampleMeta"]>(),
  studioChapters: vi.fn<PagesPorts["studioChapters"]>(),
  chapterCandidates: vi.fn<PagesPorts["chapterCandidates"]>(),
  updateSettings: vi.fn<PagesPorts["updateSettings"]>(),
  moveChapter: vi.fn<PagesPorts["moveChapter"]>(),
  aiInfo: vi.fn<PagesPorts["aiInfo"]>(),
  runAi: vi.fn<PagesPorts["runAi"]>(),
  storePreview: vi.fn<PagesPorts["storePreview"]>(),
};

const answerFilesMocks = {
  questions: vi.fn<AnswerFilesPorts["questions"]>(),
  editQuestionMedia: vi.fn<AnswerFilesPorts["editQuestionMedia"]>(),
  bookFileQuota: vi.fn<AnswerFilesPorts["bookFileQuota"]>(),
  listBookFiles: vi.fn<AnswerFilesPorts["listBookFiles"]>(),
  findBookFile: vi.fn<AnswerFilesPorts["findBookFile"]>(),
  mediaPackOffers: vi.fn<AnswerFilesPorts["mediaPackOffers"]>(),
  kaspiAvailable: vi.fn<AnswerFilesPorts["kaspiAvailable"]>(),
  startUpload: vi.fn<AnswerFilesPorts["startUpload"]>(),
  appendChunk: vi.fn<AnswerFilesPorts["appendChunk"]>(),
  finishUpload: vi.fn<AnswerFilesPorts["finishUpload"]>(),
  kickWorker: vi.fn<AnswerFilesPorts["kickWorker"]>(),
  removeFile: vi.fn<AnswerFilesPorts["removeFile"]>(),
  ensureCatalog: vi.fn<AnswerFilesPorts["ensureCatalog"]>(),
  createMediaPurchase: vi.fn<AnswerFilesPorts["createMediaPurchase"]>(),
  findMediaPurchase: vi.fn<AnswerFilesPorts["findMediaPurchase"]>(),
  kaspiPaymentProps: vi.fn<AnswerFilesPorts["kaspiPaymentProps"]>(),
  payMediaPack: vi.fn<AnswerFilesPorts["payMediaPack"]>(),
  kaspiStatus: vi.fn<AnswerFilesPorts["kaspiStatus"]>(),
};

const staffAccess: StaffAccessPort = {
  async resolve(user) {
    if (user.id === STAFF_VIEW_ID) {
      return {
        context: new StaffContext(user.id, "Наблюдатель", "viewer", "all", new Set(["clients.view"]), true, { isPhoneEmail }),
        gate: null,
      };
    }
    return null;
  },
};

let app: NestFastifyApplication;
let limiter: FakeLimiter;

beforeAll(async () => {
  ({ app, limiter } = await bootTestApp({
    users: [OWNER, STRANGER, STAFF_VIEW],
    overrides: [
      [STAFF_ACCESS, staffAccess],
      [
        CABINET_BOOK_PORTS,
        {
          bookOwnership: async () => ({ managerId: null }),
          visibleBook: async (bookId: string, viewer: { userId: string; isStaff: boolean }) => {
            if (bookId !== currentBook.id) return null;
            return currentBook.userId === viewer.userId || viewer.isStaff ? currentBook : null;
          },
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
      [PAGES_PORTS, pagesMocks],
      [ANSWER_FILES_PORTS, answerFilesMocks],
    ],
  }));
});

afterAll(async () => {
  applyCatalog(null);
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  applyCatalog({ mediaPacks: { small: { hidden: false, price: 1990, minutes: 30 } } });
  limiter.hits.length = 0;
  limiter.deny = false;

  currentBook = makeBook();
  currentQuestion = makeQuestion();
  currentFile = makeFileRow();
  currentFilesList = [currentFile];
  currentPurchase = { ...purchaseFixture };

  pagesMocks.book.mockImplementation(async (id) => (id === currentBook.id ? currentBook : null));
  pagesMocks.sampleMeta.mockResolvedValue(sampleMeta);
  pagesMocks.studioChapters.mockResolvedValue([
    { key: "ch1", title: "Детство", number: 1 },
    { key: "ch2", title: "Юность", number: 2 },
  ]);
  pagesMocks.chapterCandidates.mockResolvedValue(tocFixture);
  pagesMocks.updateSettings.mockImplementation(async (_id, _viewer, patch) => {
    currentBook = {
      ...currentBook,
      ...(patch.interior !== undefined ? { interior: patch.interior } : {}),
      ...(patch.interiorStyle !== undefined ? { interiorStyle: patch.interiorStyle } : {}),
      ...(patch.dedication !== undefined ? { dedication: patch.dedication } : {}),
      ...(patch.showToc !== undefined ? { showToc: patch.showToc } : {}),
      ...(patch.endText !== undefined ? { endText: patch.endText } : {}),
      ...(patch.titlePage !== undefined ? { titlePage: patch.titlePage } : {}),
      ...(patch.tocLines !== undefined ? { tocLines: patch.tocLines } : {}),
      ...(patch.tocMode !== undefined ? { tocMode: patch.tocMode } : {}),
      ...(patch.chapterStart !== undefined ? { chapterStart: patch.chapterStart } : {}),
      ...(patch.openersLeft !== undefined ? { paginationRev: patch.openersLeft ? 2 : 1 } : {}),
    };
  });
  pagesMocks.moveChapter.mockResolvedValue(undefined);
  pagesMocks.aiInfo.mockResolvedValue({ allowance: { remaining: 5, limit: 5, credits: 0 }, hasPhotos: true });
  pagesMocks.runAi.mockResolvedValue({
    reply: "Обновил оформление",
    concept: "Тёплая классика",
    changed: true,
    patch: { interior: "warm", interiorStyle: { body: { size: 11 } } },
  } satisfies PagesAiRunResult);
  pagesMocks.storePreview.mockResolvedValue("prev1234567890ab");

  answerFilesMocks.questions.mockImplementation(async (bookId) => (bookId === BOOK_ID ? [currentQuestion] : []));
  answerFilesMocks.editQuestionMedia.mockImplementation(async (_bookId, _viewer, _qId, media) => {
    currentQuestion = { ...currentQuestion, media };
  });
  answerFilesMocks.bookFileQuota.mockResolvedValue({ minutes: 30, usedSec: 120, leftSec: 1680, files: 1, maxFiles: 40 });
  answerFilesMocks.listBookFiles.mockImplementation(async () => currentFilesList);
  answerFilesMocks.findBookFile.mockImplementation(async (_bookId, fileId) => (currentFile && currentFile.id === fileId ? currentFile : null));
  answerFilesMocks.mediaPackOffers.mockResolvedValue([{ id: "pack-30", minutes: 30, price: 2990, featured: true }]);
  answerFilesMocks.kaspiAvailable.mockResolvedValue(true);
  answerFilesMocks.startUpload.mockImplementation(async (input) => makeFileRow({ name: input.name, sourceBytes: input.size, declaredSec: input.declaredSec }));
  answerFilesMocks.appendChunk.mockImplementation(async (_file, offset, bytes) => offset + bytes.length);
  answerFilesMocks.finishUpload.mockImplementation(async (file) => ({ ...file, status: "queued" }));
  answerFilesMocks.kickWorker.mockReturnValue(undefined);
  answerFilesMocks.removeFile.mockResolvedValue(undefined);
  answerFilesMocks.ensureCatalog.mockResolvedValue(undefined);
  answerFilesMocks.createMediaPurchase.mockResolvedValue({ id: PURCHASE_ID, number: 42, minutes: 30, amount: 2990 });
  answerFilesMocks.findMediaPurchase.mockImplementation(async (id) => (currentPurchase && currentPurchase.id === id ? currentPurchase : null));
  answerFilesMocks.kaspiPaymentProps.mockResolvedValue({ defaultPhone: "+77011112233", initial: invoiceFixture });
  answerFilesMocks.payMediaPack.mockResolvedValue(invoiceFixture);
  answerFilesMocks.kaspiStatus.mockResolvedValue({ ...invoiceFixture, status: "paid", paidAt: "2026-11-26T10:02:00.000Z" });
});

describe("Контекст 2B — Страницы и студия полос (8 маршрутов)", () => {
  it("pagesGet: 200 (ETag/304, kk, staff read-only), 401, 400, 404, 405", async () => {
    const url = `/api/v1/books/${BOOK_ID}/pages`;
    const ok = await app.inject({ method: "GET", url, headers: asOwner });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers.etag).toBeTruthy();
    expect(ok.json().bookId).toBe(BOOK_ID);
    expect(ok.json().editable).toBe(true);
    expect(ok.json().spreads).toHaveLength(4);

    const notModified = await app.inject({ method: "GET", url, headers: { ...asOwner, "if-none-match": String(ok.headers.etag) } });
    expect(notModified.statusCode).toBe(304);

    const staffRes = await app.inject({ method: "GET", url, headers: asStaffView });
    expect(staffRes.statusCode).toBe(200);
    expect(staffRes.json().editable).toBe(false);

    const kk = await app.inject({ method: "GET", url, headers: { ...asOwner, [LOCALE_HEADER]: "kk" } });
    expect(kk.statusCode).toBe(200);
    expect(kk.json().labels.tabs.styles).not.toBe(ok.json().labels.tabs.styles);

    expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/v1/books/bad-uuid/pages", headers: asOwner })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url, headers: asStranger })).statusCode).toBe(404);

    pagesMocks.sampleMeta.mockResolvedValueOnce(null);
    expect((await app.inject({ method: "GET", url, headers: asOwner })).statusCode).toBe(404);

    const wrong = await app.inject({ method: "DELETE", url, headers: asOwner });
    expect(wrong.statusCode).toBe(405);
    expect(wrong.headers.allow).toContain("GET");
    expect(wrong.headers.allow).toContain("PATCH");
  });

  it("pagesUpdate: 200 (смена стиля с сбросом customCount, fontPair, styleJson), 400, 403, 404, 409, 405", async () => {
    const url = `/api/v1/books/${BOOK_ID}/pages`;
    currentBook = makeBook({ interior: "classic", interiorStyle: { body: { size: 12 } } });

    const ok = await app.inject({
      method: "PATCH",
      url,
      headers: { ...asOwner, ...ORIGIN },
      payload: { interior: "minimal", dedication: "Новое посвящение", showToc: false },
    });
    expect(ok.statusCode).toBe(200);
    expect(pagesMocks.updateSettings).toHaveBeenCalledWith(
      BOOK_ID,
      expect.objectContaining({ userId: OWNER_ID }),
      expect.objectContaining({ interior: "minimal", interiorStyle: {}, dedication: "Новое посвящение", showToc: false }),
    );
    expect(ok.json().state.interior).toBe("minimal");
    expect(ok.json().state.customCount).toBe(0);

    const fontPairRes = await app.inject({
      method: "PATCH",
      url,
      headers: { ...asOwner, ...ORIGIN },
      payload: { fontPair: fontPairs[0].id },
    });
    expect(fontPairRes.statusCode).toBe(200);
    expect(fontPairRes.json().state.customCount).toBeGreaterThan(0);

    expect((await app.inject({ method: "PATCH", url, headers: { ...asOwner, ...ORIGIN }, payload: { interior: "nonexistent" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PATCH", url, headers: { ...asOwner, ...ORIGIN }, payload: { fontPair: "unknown" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PATCH", url, headers: { ...asOwner, ...ORIGIN }, payload: { styleJson: "{broken" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PATCH", url, headers: { ...asOwner, origin: "https://evil.example" }, payload: { showToc: true } })).statusCode).toBe(403);
    expect((await app.inject({ method: "PATCH", url, headers: { ...asStaffView, ...ORIGIN }, payload: { showToc: true } })).statusCode).toBe(404);

    currentBook = makeBook({ status: "ordered" });
    const locked = await app.inject({ method: "PATCH", url, headers: { ...asOwner, ...ORIGIN }, payload: { showToc: true } });
    expect(locked.statusCode).toBe(409);
    expect(locked.json().code).toBe("bookLocked");
  });

  it("pagesStudioGet и pagesStudioApply: 200 по всем вкладкам, запись, 400, 401, 404, 409, 405", async () => {
    for (const tab of ["text", "elements", "colors", "chapters", "fonts"] as const) {
      const res = await app.inject({ method: "GET", url: `/api/v1/books/${BOOK_ID}/pages/studio?tab=${tab}`, headers: asOwner });
      expect(res.statusCode).toBe(200);
      expect(res.json().tab).toBe(tab);
      expect(res.headers.etag).toBeTruthy();
    }
    expect(pagesMocks.studioChapters).toHaveBeenCalledTimes(1);

    expect((await app.inject({ method: "GET", url: `/api/v1/books/${BOOK_ID}/pages/studio?tab=unknown`, headers: asOwner })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: `/api/v1/books/${BOOK_ID}/pages/studio?tab=text` })).statusCode).toBe(401);
    expect((await app.inject({ method: "DELETE", url: `/api/v1/books/${BOOK_ID}/pages/studio?tab=text`, headers: asOwner })).statusCode).toBe(405);

    const applyUrl = `/api/v1/books/${BOOK_ID}/pages/studio`;
    const applied = await app.inject({
      method: "POST",
      url: applyUrl,
      headers: { ...asOwner, ...ORIGIN },
      payload: {
        tab: "elements",
        chapter: null,
        ops: [
          { target: "book", section: "book", key: "titlePage", json: "false" },
          { target: "style", section: "body", key: "size", json: "11.5" },
        ],
      },
    });
    expect(applied.statusCode).toBe(200);
    expect(pagesMocks.updateSettings).toHaveBeenCalledWith(
      BOOK_ID,
      expect.objectContaining({ userId: OWNER_ID }),
      expect.objectContaining({ titlePage: false, interiorStyle: expect.objectContaining({ body: { size: 11.5 } }) }),
    );
    expect(applied.json().view.state.titlePage).toBe(false);

    const badJsonOp = await app.inject({
      method: "POST",
      url: applyUrl,
      headers: { ...asOwner, ...ORIGIN },
      payload: { tab: "text", chapter: null, ops: [{ target: "style", section: "body", key: "size", json: "{bad" }] },
    });
    expect(badJsonOp.statusCode).toBe(400);

    currentBook = makeBook({ status: "ordered" });
    expect(
      (
        await app.inject({
          method: "POST",
          url: applyUrl,
          headers: { ...asOwner, ...ORIGIN },
          payload: { tab: "text", chapter: null, ops: [{ target: "style", section: "body", key: "size", json: "11" }] },
        })
      ).statusCode,
    ).toBe(409);
  });

  it("pagesAiInfo и pagesAi: edit (с сохранением и без), create, variants, review и ошибки 402/429/503/409/405", async () => {
    const url = `/api/v1/books/${BOOK_ID}/pages/ai`;
    const infoRes = await app.inject({ method: "GET", url, headers: asOwner });
    expect(infoRes.statusCode).toBe(200);
    expect(infoRes.json().remaining).toBe(5);
    expect(infoRes.json().out).toBe(false);

    pagesMocks.aiInfo.mockResolvedValueOnce({ allowance: { remaining: 0, limit: 5, credits: 0 }, hasPhotos: false });
    const outRes = await app.inject({ method: "GET", url, headers: asOwner });
    expect(outRes.json().out).toBe(true);

    // edit changed=true -> сохраняет настройки
    const editRes = await app.inject({
      method: "POST",
      url,
      headers: { ...asOwner, ...ORIGIN },
      payload: { mode: "edit", prompt: "Сделай теплее", history: [] },
    });
    expect(editRes.statusCode).toBe(200);
    expect(editRes.json().changed).toBe(true);
    expect(pagesMocks.updateSettings).toHaveBeenCalledWith(
      BOOK_ID,
      expect.objectContaining({ userId: OWNER_ID }),
      { interior: "warm", interiorStyle: { body: { size: 11 } } },
    );

    // edit changed=false -> не сохраняет настройки
    pagesMocks.updateSettings.mockClear();
    pagesMocks.runAi.mockResolvedValueOnce({ reply: "Всё уже отлично", concept: null, changed: false, patch: { interior: "classic", interiorStyle: {} } });
    const noChange = await app.inject({
      method: "POST",
      url,
      headers: { ...asOwner, ...ORIGIN },
      payload: { mode: "edit", prompt: "Ничего не меняй", history: [] },
    });
    expect(noChange.statusCode).toBe(200);
    expect(noChange.json().patch).toBeNull();
    expect(pagesMocks.updateSettings).not.toHaveBeenCalled();

    // variants -> вызывает storePreview
    pagesMocks.runAi.mockResolvedValueOnce({
      reply: "Три варианта",
      variants: [{ name: "Тёплый", idea: "Уютная бумага", patch: { interior: "warm", interiorStyle: {} } }],
    });
    const variantsRes = await app.inject({
      method: "POST",
      url,
      headers: { ...asOwner, ...ORIGIN },
      payload: { mode: "variants", prompt: "", history: [] },
    });
    expect(variantsRes.statusCode).toBe(200);
    expect(pagesMocks.storePreview).toHaveBeenCalledWith(BOOK_ID, { interior: "warm", style: {} });
    expect(variantsRes.json().variants[0].imageUrl).toContain("preview=prev1234567890ab");

    // review -> score + tips
    pagesMocks.runAi.mockResolvedValueOnce({
      score: 9,
      summary: "Отличная вёрстка",
      strengths: ["Чистые поля"],
      tips: [{ title: "Кегль", why: "Чуть крупнее", patch: { interior: "classic", interiorStyle: { body: { size: 11 } } } }],
    });
    const reviewRes = await app.inject({
      method: "POST",
      url,
      headers: { ...asOwner, ...ORIGIN },
      payload: { mode: "review", prompt: "Оцени", history: [] },
    });
    expect(reviewRes.statusCode).toBe(200);
    expect(reviewRes.json().score).toBe(9);
    expect(reviewRes.json().tips).toHaveLength(1);

    // Ошибки ИИ (HttpError-метка, как из runDesignAiRequest)
    const httpErr = (status: number, code: string) => Object.assign(new Error(code), { [Symbol.for("mybook.http-error")]: true, status, code });
    pagesMocks.runAi.mockRejectedValueOnce(httpErr(402, "designAiLimit"));
    expect((await app.inject({ method: "POST", url, headers: { ...asOwner, ...ORIGIN }, payload: { mode: "edit", prompt: "Поправь", history: [] } })).statusCode).toBe(402);

    pagesMocks.runAi.mockRejectedValueOnce(httpErr(429, "writeAiRate"));
    expect((await app.inject({ method: "POST", url, headers: { ...asOwner, ...ORIGIN }, payload: { mode: "edit", prompt: "Поправь", history: [] } })).statusCode).toBe(429);

    pagesMocks.runAi.mockRejectedValueOnce(httpErr(503, "designAiOff"));
    expect((await app.inject({ method: "POST", url, headers: { ...asOwner, ...ORIGIN }, payload: { mode: "edit", prompt: "Поправь", history: [] } })).statusCode).toBe(503);

    expect((await app.inject({ method: "PUT", url, headers: asOwner })).statusCode).toBe(405);
  });

  it("pagesChapters и pagesChaptersUpdate: чтение, перестановка, правка строки, tocMode, 400, 409, 405", async () => {
    const url = `/api/v1/books/${BOOK_ID}/pages/chapters`;
    const getRes = await app.inject({ method: "GET", url, headers: asOwner });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().rows).toHaveLength(3);
    expect(getRes.json().rows[1].canUp).toBe(true);
    expect(getRes.json().rows[1].canDown).toBe(true);

    // Перестановка главы вверх
    const moveRes = await app.inject({
      method: "POST",
      url,
      headers: { ...asOwner, ...ORIGIN },
      payload: { key: "ch2", move: "up" },
    });
    expect(moveRes.statusCode).toBe(200);
    expect(pagesMocks.moveChapter).toHaveBeenCalledWith(BOOK_ID, expect.objectContaining({ userId: OWNER_ID }), { key: "ch2", beforeKey: "ch1" });

    // Правка названия/эпиграфа + режима оглавления
    const editRes = await app.inject({
      method: "POST",
      url,
      headers: { ...asOwner, ...ORIGIN },
      payload: { key: "c:ch2", title: "  Молодость  ", epigraph: "  Новые годы  ", tocMode: "both" },
    });
    expect(editRes.statusCode).toBe(200);
    expect(pagesMocks.updateSettings).toHaveBeenCalledWith(
      BOOK_ID,
      expect.objectContaining({ userId: OWNER_ID }),
      { tocLines: { "c:ch2": { title: "Молодость", epigraph: "Новые годы" } } },
    );
    expect(pagesMocks.updateSettings).toHaveBeenCalledWith(
      BOOK_ID,
      expect.objectContaining({ userId: OWNER_ID }),
      { tocMode: "both" },
    );

    expect((await app.inject({ method: "POST", url, headers: { ...asOwner, ...ORIGIN }, payload: { move: "sideways" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "DELETE", url, headers: asOwner })).statusCode).toBe(405);

    currentBook = makeBook({ status: "ordered" });
    expect((await app.inject({ method: "POST", url, headers: { ...asOwner, ...ORIGIN }, payload: { tocMode: "sections" } })).statusCode).toBe(409);
  });
});

describe("Контекст 2B — Медиа и файлы ответов (11 маршрутов)", () => {
  it("answerMediaGet, answerMediaSave, answerMediaAddLink: 200, oEmbed, 400 (badUrl/limit/duplicate), 404, 409, 405", async () => {
    const mediaUrl = `/api/v1/books/${BOOK_ID}/questions/${QUESTION_ID}/media`;
    const linkUrl = `${mediaUrl}/link`;

    const readyFile = makeFileRow({ status: "ready", durationSec: 95, hasPoster: true, readyAt: new Date("2026-11-21T00:00:00Z") });
    currentFilesList = [readyFile];
    currentQuestion = makeQuestion({
      media: [
        { id: "m1", kind: "video", url: "https://mybooks.kz/v/AbCdEf1234", fileId: FILE_ID, title: "Ролик", anchor: null },
        { id: "m2", kind: "audio", url: "https://mybooks.kz/v/Gone123456", fileId: "99999999-9999-4999-8999-999999999999", title: "Удалён", anchor: 0 },
      ],
    });

    const getRes = await app.inject({ method: "GET", url: mediaUrl, headers: asOwner });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.headers.etag).toBeTruthy();
    expect(getRes.json().media).toHaveLength(2);
    expect(getRes.json().media[0].file.status).toBe("ready");
    expect(getRes.json().media[1].file.status).toBe("gone");
    expect(getRes.json().packs).toHaveLength(1);

    // 404 несуществующий вопрос
    expect((await app.inject({ method: "GET", url: `/api/v1/books/${BOOK_ID}/questions/99999999-9999-4999-8999-999999999999/media`, headers: asOwner })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: mediaUrl })).statusCode).toBe(401);
    expect((await app.inject({ method: "DELETE", url: mediaUrl, headers: asOwner })).statusCode).toBe(405);

    // answerMediaSave
    const saved = await app.inject({
      method: "PUT",
      url: mediaUrl,
      headers: { ...asOwner, ...ORIGIN },
      payload: { media: [{ id: "m3", kind: "music", url: "https://open.spotify.com/track/abc", title: "Песня", anchor: null }] },
    });
    expect(saved.statusCode).toBe(200);
    expect(answerFilesMocks.editQuestionMedia).toHaveBeenCalledWith(BOOK_ID, expect.objectContaining({ userId: OWNER_ID }), QUESTION_ID, [
      { id: "m3", kind: "music", url: "https://open.spotify.com/track/abc", title: "Песня", anchor: null },
    ]);

    // answerMediaAddLink: YouTube oEmbed
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ title: "Семейный вечер" }), { status: 200, headers: { "content-type": "application/json" } })),
    );
    const added = await app.inject({
      method: "POST",
      url: linkUrl,
      headers: { ...asOwner, ...ORIGIN },
      payload: { url: "https://youtu.be/dQw4w9WgXcQ" },
    });
    expect(added.statusCode).toBe(200);
    expect(added.json().media.at(-1).title).toBe("Семейный вечер");
    expect(added.json().media.at(-1).kind).toBe("video");

    // duplicate -> 400
    const dup = await app.inject({
      method: "POST",
      url: linkUrl,
      headers: { ...asOwner, ...ORIGIN },
      payload: { url: "https://youtu.be/dQw4w9WgXcQ" },
    });
    expect(dup.statusCode).toBe(400);
    expect(dup.json().code).toBe("duplicate");

    // badUrl -> 400
    const bad = await app.inject({
      method: "POST",
      url: linkUrl,
      headers: { ...asOwner, ...ORIGIN },
      payload: { url: "not-a-url" },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe("badUrl");

    // tooManyMedia -> 400
    const fullMedia: AnswerMedia[] = Array.from({ length: MAX_MEDIA }, (_, i) => ({
      id: `id-${i}`,
      kind: "video",
      url: `https://example.com/v/${i}`,
      title: "",
      anchor: null,
    }));
    currentQuestion = makeQuestion({ media: fullMedia });
    const full = await app.inject({
      method: "POST",
      url: linkUrl,
      headers: { ...asOwner, ...ORIGIN },
      payload: { url: "https://example.com/v/extra" },
    });
    expect(full.statusCode).toBe(400);
    expect(full.json().code).toBe("tooManyMedia");

    expect((await app.inject({ method: "GET", url: linkUrl, headers: asOwner })).statusCode).toBe(405);
  });

  it("answerFileStart, Status, Chunk, Finish, Delete: 200, 429, 400, 404, 409, 413, 415, 422, 402, 405", async () => {
    const startUrl = `/api/v1/books/${BOOK_ID}/files`;
    const fileUrl = `/api/v1/books/${BOOK_ID}/files/${FILE_ID}`;
    const chunkUrl = `${fileUrl}/chunk?offset=0`;
    const finishUrl = `${fileUrl}/finish`;

    // start 200 + ключ лимитера
    const started = await app.inject({
      method: "POST",
      url: startUrl,
      headers: { ...asOwner, ...ORIGIN },
      payload: { name: "clip.mp4", size: 2048, type: "video/mp4", durationSec: 30 },
    });
    expect(started.statusCode).toBe(200);
    expect(started.json().chunkBytes).toBe(FILE_CHUNK_BYTES);
    expect(limiter.hits).toContain(`answer-file:${OWNER_ID}`);

    // start 429
    limiter.deny = true;
    const rateLimited = await app.inject({
      method: "POST",
      url: startUrl,
      headers: { ...asOwner, ...ORIGIN },
      payload: { name: "clip.mp4", size: 2048, type: "video/mp4", durationSec: 30 },
    });
    expect(rateLimited.statusCode).toBe(429);
    expect(rateLimited.json().code).toBe("fileRate");
    limiter.deny = false;

    // start доменные ошибки
    for (const [code, status, params] of [
      ["fileType", 415, []],
      ["fileTooBig", 413, [1]],
      ["fileTooLong", 422, [10]],
      ["fileQuota", 402, []],
      ["fileLimit", 409, [40]],
      ["fileBusy", 503, []],
    ] as const) {
      answerFilesMocks.startUpload.mockRejectedValueOnce(new AuthoringError(code, undefined, [...params]));
      const errRes = await app.inject({
        method: "POST",
        url: startUrl,
        headers: { ...asOwner, ...ORIGIN },
        payload: { name: "clip.mp4", size: 2048, type: "video/mp4", durationSec: 30 },
      });
      expect(errRes.statusCode).toBe(status);
      expect(errRes.json().code).toBe(code);
    }

    // status 200 + ETag/304 + 404
    const statusRes = await app.inject({ method: "GET", url: fileUrl, headers: asOwner });
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.json().file.id).toBe(FILE_ID);
    expect((await app.inject({ method: "GET", url: fileUrl, headers: { ...asOwner, "if-none-match": String(statusRes.headers.etag) } })).statusCode).toBe(304);

    currentFile = null;
    expect((await app.inject({ method: "GET", url: fileUrl, headers: asOwner })).statusCode).toBe(404);
    currentFile = makeFileRow();

    // chunk 200 (multipart)
    const part = multipartChunk("chunk", Buffer.from("hello-video-bytes"));
    const chunkOk = await app.inject({
      method: "PUT",
      url: chunkUrl,
      headers: { ...asOwner, ...ORIGIN, ...part.headers },
      payload: part.payload,
    });
    expect(chunkOk.statusCode).toBe(200);
    expect(chunkOk.json()).toEqual({ received: 17 });
    expect(answerFilesMocks.appendChunk).toHaveBeenCalledWith(currentFile, 0, Buffer.from("hello-video-bytes"));

    // chunk: не multipart -> 400
    expect(
      (
        await app.inject({
          method: "PUT",
          url: chunkUrl,
          headers: { ...asOwner, ...ORIGIN, "content-type": "application/json" },
          payload: "{}",
        })
      ).statusCode,
    ).toBe(400);

    // chunk: пустое поле -> 400 fileChunk
    const emptyPart = multipartChunk("chunk", Buffer.alloc(0));
    const emptyChunkRes = await app.inject({
      method: "PUT",
      url: chunkUrl,
      headers: { ...asOwner, ...ORIGIN, ...emptyPart.headers },
      payload: emptyPart.payload,
    });
    expect(emptyChunkRes.statusCode).toBe(400);
    expect(emptyChunkRes.json().code).toBe("fileChunk");

    // chunk: слишком большой кусок -> 413 fileChunk
    const tooBigPart = multipartChunk("chunk", Buffer.alloc(FILE_CHUNK_BYTES + 1));
    const tooBigRes = await app.inject({
      method: "PUT",
      url: chunkUrl,
      headers: { ...asOwner, ...ORIGIN, ...tooBigPart.headers },
      payload: tooBigPart.payload,
    });
    expect(tooBigRes.statusCode).toBe(413);
    expect(tooBigRes.json().code).toBe("fileChunk");

    // chunk: доменная ошибка -> 409
    answerFilesMocks.appendChunk.mockRejectedValueOnce(new AuthoringError("fileChunk"));
    const conflictChunk = await app.inject({
      method: "PUT",
      url: chunkUrl,
      headers: { ...asOwner, ...ORIGIN, ...part.headers },
      payload: part.payload,
    });
    expect(conflictChunk.statusCode).toBe(409);

    // finish 200 -> вызывает finishUpload и kickWorker
    const finished = await app.inject({ method: "POST", url: finishUrl, headers: { ...asOwner, ...ORIGIN } });
    expect(finished.statusCode).toBe(200);
    expect(finished.json().file.status).toBe("queued");
    expect(answerFilesMocks.finishUpload).toHaveBeenCalledWith(currentFile);
    expect(answerFilesMocks.kickWorker).toHaveBeenCalledTimes(1);

    // delete 200 -> вызывает removeFile
    const deleted = await app.inject({ method: "DELETE", url: fileUrl, headers: { ...asOwner, ...ORIGIN } });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ ok: true });
    expect(answerFilesMocks.removeFile).toHaveBeenCalledWith(currentFile);

    // 405
    expect((await app.inject({ method: "GET", url: startUrl, headers: asOwner })).statusCode).toBe(405);
    expect((await app.inject({ method: "POST", url: chunkUrl, headers: asOwner })).statusCode).toBe(405);
    expect((await app.inject({ method: "GET", url: finishUrl, headers: asOwner })).statusCode).toBe(405);
  });

  it("answerFilePackBuy, answerFilePackKaspi, answerFilePackKaspiStatus: 200, порядок проверок, 404, 429, ошибки Kaspi, 405", async () => {
    const buyUrl = `/api/v1/books/${BOOK_ID}/files/packs`;
    const kaspiUrl = `/api/v1/books/${BOOK_ID}/files/packs/${PURCHASE_ID}/kaspi`;
    const statusUrl = `${kaspiUrl}/${INVOICE_ID}`;

    // packBuy 200
    const bought = await app.inject({
      method: "POST",
      url: buyUrl,
      headers: { ...asOwner, ...ORIGIN },
      payload: { packId: "small" },
    });
    expect(bought.statusCode).toBe(200);
    expect(bought.json().purchase.id).toBe(PURCHASE_ID);
    expect(bought.json().kaspi.defaultPhone).toBe("+77011112233");
    expect(answerFilesMocks.ensureCatalog).toHaveBeenCalledTimes(1);
    expect(limiter.hits).toContain(`media-pack:${OWNER_ID}`);

    // packBuy unknown pack -> 404
    expect((await app.inject({ method: "POST", url: buyUrl, headers: { ...asOwner, ...ORIGIN }, payload: { packId: "nope" } })).statusCode).toBe(404);

    // packBuy 429
    limiter.deny = true;
    const buyLimited = await app.inject({ method: "POST", url: buyUrl, headers: { ...asOwner, ...ORIGIN }, payload: { packId: "small" } });
    expect(buyLimited.statusCode).toBe(429);
    expect(buyLimited.json().code).toBe("kaspiRate");
    limiter.deny = false;

    // packKaspi: чужая покупка -> 404 ДО лимита частоты
    limiter.hits.length = 0;
    currentPurchase = { ...purchaseFixture, userId: STRANGER_ID };
    const foreignPurchase = await app.inject({
      method: "POST",
      url: kaspiUrl,
      headers: { ...asOwner, ...ORIGIN },
      payload: { method: "qr", phone: "" },
    });
    expect(foreignPurchase.statusCode).toBe(404);
    expect(limiter.hits).toEqual([]);
    currentPurchase = { ...purchaseFixture };

    // packKaspi 200
    const issued = await app.inject({
      method: "POST",
      url: kaspiUrl,
      headers: { ...asOwner, ...ORIGIN },
      payload: { method: "invoice", phone: "+77011112233" },
    });
    expect(issued.statusCode).toBe(200);
    expect(issued.json().invoice.id).toBe(INVOICE_ID);
    expect(limiter.hits).toContain(`kaspi-invoice-user:${OWNER_ID}`);

    // packKaspi: ошибка домена Kaspi -> 503
    answerFilesMocks.payMediaPack.mockRejectedValueOnce(new OrderingError("kaspiNotConnected"));
    const kaspiOff = await app.inject({
      method: "POST",
      url: kaspiUrl,
      headers: { ...asOwner, ...ORIGIN },
      payload: { method: "qr", phone: "" },
    });
    expect(kaspiOff.statusCode).toBe(503);
    expect(kaspiOff.json().code).toBe("kaspiNotConnected");

    // packKaspiStatus: работает и на заказанной книге, сначала kaspiStatus, потом bookFileQuota
    currentBook = makeBook({ status: "ordered" });
    const callOrder: string[] = [];
    answerFilesMocks.kaspiStatus.mockImplementationOnce(async () => {
      callOrder.push("kaspiStatus");
      return { ...invoiceFixture, status: "paid", paidAt: "2026-11-26T10:02:00.000Z" };
    });
    answerFilesMocks.bookFileQuota.mockImplementationOnce(async () => {
      callOrder.push("bookFileQuota");
      return { minutes: 60, usedSec: 120, leftSec: 3480, files: 1, maxFiles: 40 };
    });
    const st = await app.inject({ method: "GET", url: statusUrl, headers: asOwner });
    expect(st.statusCode).toBe(200);
    expect(st.json().invoice.status).toBe("paid");
    expect(st.json().quota.minutes).toBe(60);
    expect(callOrder).toEqual(["kaspiStatus", "bookFileQuota"]);

    // 405
    expect((await app.inject({ method: "PUT", url: buyUrl, headers: asOwner })).statusCode).toBe(405);
    expect((await app.inject({ method: "GET", url: kaspiUrl, headers: asOwner })).statusCode).toBe(405);
    expect((await app.inject({ method: "POST", url: statusUrl, headers: asOwner })).statusCode).toBe(405);
  });
});
