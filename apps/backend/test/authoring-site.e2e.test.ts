import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getAiPacks, getMediaPacks } from "@/config/site";
import { LOCALE_HEADER } from "@/i18n/config";
import { FILE_CHUNK_BYTES } from "@/lib/book/answer-files";
import { fontFiles } from "@/lib/book/fonts";
import { StaffContext } from "@/modules/access/domain/StaffContext";
import { AssistantError } from "@/modules/assistant";
import { AuthoringError, isBookVisibleTo, type BookRow, type BookViewer, type LetterRow, type PhotoRow, type QuestionRow } from "@/modules/authoring";
import { isPhoneEmail } from "@/modules/identity";
import { RasterizerMissingError } from "@/modules/production";
import { STAFF_ACCESS, type StaffAccessPort } from "../src/core/auth/staff";
import { loadConfig } from "../src/core/config/app-config";
import {
  AUTHORING,
  AUTHORING_BOOK_OWNERSHIP,
  AUTHORING_PHOTO_LIMIT,
  AUTHORING_PREVIEWS,
} from "../src/modules/authoring/authoring.tokens";
import {
  AUTHORING_SITE_PORTS,
  type AuthoringSitePorts,
  type SiteAnswerFileRow,
} from "../src/modules/authoring-site/authoring-site.tokens";
import { bootTestApp, sessionOf, testUser, type FakeLimiter } from "./app";

const OWNER = testUser("11111111-1111-4111-8111-111111111111", { name: "Алия", phone: "+77011112233", locale: "ru" });
const STRANGER = testUser("22222222-2222-4222-8222-222222222222", { name: "Марат", locale: "ru" });
const STAFF_ALL = testUser("33333333-3333-4333-8333-333333333333", { name: "Редактор", role: "admin" });
const STAFF_OWN = testUser("44444444-4444-4444-8444-444444444444", { name: "Менеджер", role: "admin" });
const STAFF_VIEW_ONLY = testUser("55555555-5555-4555-8555-555555555555", { name: "Читатель", role: "admin" });

const BOOK_ID = "aaaa1111-1111-4111-8111-111111111111";
const BOOK_ORDERED_ID = "aaaa2222-2222-4222-8222-222222222222";
const BOOK_KK_ID = "aaaa3333-3333-4333-8333-333333333333";
const Q1_ID = "bbbb1111-1111-4111-8111-111111111111";
const CH1_ID = "bbbb2222-2222-4222-8222-222222222222";
const P1_ID = "cccc1111-1111-4111-8111-111111111111";
const L1_ID = "dddd1111-1111-4111-8111-111111111111";
const FILE1_ID = "eeee1111-1111-4111-8111-111111111111";
const FILE_TOKEN = "AbCdEf1234";
const BUILD_FP = "0123456789abcdef";
const SAMPLE_FONT = [...fontFiles][0];
const ORIGIN = loadConfig().appUrl;

const NOW = new Date("2026-11-26T10:00:00.000Z");

function makeBook(over: Partial<BookRow> = {}): BookRow {
  return {
    id: BOOK_ID,
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
    backText: "С любовью",
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
    inviteToken: "inv-token",
    inviteText: "",
    endText: null,
    chapterStart: "page",
    titlePage: true,
    language: "ru",
    occasion: null,
    occasionDate: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

const sampleQuestion: QuestionRow = {
  id: Q1_ID,
  bookId: BOOK_ID,
  chapter: "meeting",
  questionKey: "love.meeting.1",
  position: 0,
  prompt: "Как вы познакомились?",
  hint: null,
  title: "Первая встреча",
  displayText: null,
  hideHeading: false,
  pageBreak: false,
  answer: "Осенью в Алматы.",
  media: [],
  createdAt: NOW,
  updatedAt: NOW,
};

const samplePhoto: PhotoRow = {
  id: P1_ID,
  bookId: BOOK_ID,
  storageKey: "photos/p1.jpg",
  thumbKey: "photos/p1_thumb.jpg",
  width: 1600,
  height: 1200,
  caption: "Прогулка",
  chapter: "meeting",
  questionId: Q1_ID,
  inline: null,
  opener: false,
  layout: "full",
  crop: null,
  position: 0,
  createdAt: NOW,
  updatedAt: NOW,
};

const sampleLetter: LetterRow = {
  id: L1_ID,
  bookId: BOOK_ID,
  authorName: "Сестра",
  relation: "сестра",
  text: "Поздравляю с праздником!",
  status: "approved",
  position: 0,
  createdAt: NOW,
  updatedAt: NOW,
};

function makeAnswerFile(over: Partial<SiteAnswerFileRow> = {}): SiteAnswerFileRow {
  return {
    id: FILE1_ID,
    token: FILE_TOKEN,
    bookId: BOOK_ID,
    userId: OWNER.id,
    kind: "video",
    status: "ready",
    name: "clip.mp4",
    sourceMime: "video/mp4",
    sourceBytes: 1024,
    receivedBytes: 1024,
    declaredSec: 12,
    durationSec: 12,
    width: 1280,
    height: 720,
    hasPoster: true,
    error: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

const asOwner = { cookie: `mb_session=${sessionOf(OWNER)}`, origin: ORIGIN };
const asStranger = { cookie: `mb_session=${sessionOf(STRANGER)}`, origin: ORIGIN };
const asStaffAll = { cookie: `mb_session=${sessionOf(STAFF_ALL)}`, origin: ORIGIN };
const asStaffOwn = { cookie: `mb_session=${sessionOf(STAFF_OWN)}`, origin: ORIGIN };
const asStaffView = { cookie: `mb_session=${sessionOf(STAFF_VIEW_ONLY)}`, origin: ORIGIN };

function makeMultipart(parts: Array<{ name: string; value: string | Buffer; filename?: string; contentType?: string }>) {
  const boundary = "----mb-test-boundary";
  const chunks: Buffer[] = [];
  for (const p of parts) {
    const head = p.filename
      ? `--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"; filename="${p.filename}"\r\nContent-Type: ${p.contentType ?? "application/octet-stream"}\r\n\r\n`
      : `--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"\r\n\r\n`;
    chunks.push(Buffer.from(head, "utf8"));
    chunks.push(Buffer.isBuffer(p.value) ? p.value : Buffer.from(p.value, "utf8"));
    chunks.push(Buffer.from("\r\n", "utf8"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  return { contentType: `multipart/form-data; boundary=${boundary}`, payload: Buffer.concat(chunks) };
}

describe("Контекст 2C — все 42 маршрута сайта Authoring (@SiteRoute)", () => {
  let app: NestFastifyApplication;
  let limiter: FakeLimiter;
  let books: Map<string, BookRow>;
  let answerFile: SiteAnswerFileRow | null;
  let kicks: number;
  let lastBookPatch: Record<string, unknown> | null;
  let lastChunk: { offset: number; bytes: Buffer } | null;
  let lastUploadCount: number;
  let lastHelpLocale: string | null;
  let lastDesignAiLocale: string | null;
  let lastBuildRetry: boolean | undefined;
  let kaspiAvailable = true;
  let pageImageResult: { data: Buffer; limited: boolean } | "rasterizer" | null;
  let proofreadOn = true;
  let writerOn = true;
  let clientAiDecision: "ok" | "short" | "long" = "ok";
  let proofreadThrow: Error | null = null;
  let writerThrow: Error | null = null;
  let oembedResult: { ok: true; title: string | null } | { ok: false } = { ok: true, title: "Ролик на YouTube" };

  const spyEdit = vi.fn(async () => {});
  const spyDeleteCustom = vi.fn(async () => null);
  const spyMoveStory = vi.fn(async () => {});
  const spyAddCustom = vi.fn(async () => Q1_ID);
  const spyAddSection = vi.fn(async () => ({ id: Q1_ID, outline: { chapters: [] } }));
  const spyReorderSections = vi.fn(async () => ({ chapters: [] }));
  const spyAddChapter = vi.fn(async () => ({ key: CH1_ID, sectionId: Q1_ID, outline: { chapters: [] } }));
  const spyRenameChapter = vi.fn(async () => ({ chapters: [] }));
  const spyDeleteChapter = vi.fn(async () => ({ chapters: [] }));
  const spyReorderChapters = vi.fn(async () => ({ chapters: [] }));
  const spyMoveChapter = vi.fn(async () => ["meeting", "family"]);
  const spySetLetterInvite = vi.fn(async () => "new-inv-tok");
  const spyLettersReorder = vi.fn(async () => {});
  const spyLetterEdit = vi.fn(async () => {});
  const spyLetterDelete = vi.fn(async () => {});
  const spyBookDelete = vi.fn(async () => {});
  const spyPhotosReorder = vi.fn(async () => {});
  const spyPhotosBatch = vi.fn(async () => {});
  const spyPhotoUpdate = vi.fn(async () => {});
  const spyPhotoDelete = vi.fn(async () => {});
  const spyPhotoRotate = vi.fn(async () => {});
  const spyPhotoSaveEdit = vi.fn(async () => {});
  const spyPhotoRevertEdit = vi.fn(async () => {});
  const spyUpgradeLayout = vi.fn(async () => 2);
  const spyRemoveFile = vi.fn(async () => {});
  const spyMisspelled = vi.fn(async (words: string[]) => ({ [words[0]]: ["привет"] }));

  const staffAccess: StaffAccessPort = {
    async resolve(user) {
      if (user.id === STAFF_ALL.id) {
        return { context: new StaffContext(user.id, "Редактор", "editor", "all", new Set(["clients.view", "clients.edit"]), false, { isPhoneEmail }), gate: null };
      }
      if (user.id === STAFF_OWN.id) {
        return { context: new StaffContext(user.id, "Менеджер", "sales", "own", new Set(["clients.view", "clients.edit"]), false, { isPhoneEmail }), gate: null };
      }
      if (user.id === STAFF_VIEW_ONLY.id) {
        return { context: new StaffContext(user.id, "Читатель", "viewer", "all", new Set(["clients.view"]), false, { isPhoneEmail }), gate: null };
      }
      return null;
    },
  };

  beforeAll(async () => {
    const authoringMock = {
      photoRepository: { tag: "photo-repo" },
      books: {
        updateSettings: async (id: string, viewer: BookViewer, patch: Record<string, unknown>, repo: unknown) => {
          const b = books.get(id);
          if (!b || !isBookVisibleTo(b.userId, viewer)) throw new AuthoringError("bookNotFound");
          lastBookPatch = { ...patch, repoTag: (repo as { tag?: string })?.tag };
        },
        delete: spyBookDelete,
        setLetterInvite: spySetLetterInvite,
      },
      questions: {
        edit: spyEdit,
        deleteCustom: spyDeleteCustom,
        moveStory: spyMoveStory,
        addCustom: spyAddCustom,
        moveChapter: spyMoveChapter,
      },
      outline: {
        addSection: spyAddSection,
        reorderSections: spyReorderSections,
        addChapter: spyAddChapter,
        renameChapter: spyRenameChapter,
        deleteChapter: spyDeleteChapter,
        reorderChapters: spyReorderChapters,
      },
      photos: {
        reorder: spyPhotosReorder,
        batch: spyPhotosBatch,
        update: spyPhotoUpdate,
        delete: spyPhotoDelete,
        rotate: spyPhotoRotate,
        editState: async () => ({ edit: null, version: "v1" }),
        saveEdit: spyPhotoSaveEdit,
        revertEdit: spyPhotoRevertEdit,
        originalKey: async (p: PhotoRow) => `orig/${p.storageKey}`,
        upgradeLayout: spyUpgradeLayout,
        upload: async (_bookId: string, _viewer: BookViewer, files: Array<{ name: string; size: number }>) => {
          lastUploadCount = files.length;
          return {
            created: [{ id: P1_ID }],
            failed: [{ name: "huge.jpg", reason: "tooBig" as const }],
            damaged: ["broken.jpg"],
          };
        },
      },
      letters: {
        reorder: spyLettersReorder,
        edit: spyLetterEdit,
        delete: spyLetterDelete,
      },
      photoViewFile: async () => Buffer.from("VIEW-JPG"),
      queries: {
        book: async (id: string) => books.get(id) ?? null,
        visibleBook: async (id: string, viewer: BookViewer) => {
          const b = books.get(id);
          return b && isBookVisibleTo(b.userId, viewer) ? b : null;
        },
        questions: async () => [sampleQuestion],
        photos: async () => [samplePhoto],
        letters: async () => [sampleLetter],
        photoBookId: async (pid: string) => (pid === P1_ID ? BOOK_ID : null),
        photoFor: async (pid: string, viewer: BookViewer) => {
          if (pid !== P1_ID) return null;
          return isBookVisibleTo(OWNER.id, viewer) ? samplePhoto : null;
        },
      },
    };

    const sitePorts: AuthoringSitePorts = {
      bookFileQuota: async () => ({ minutes: 30, usedSec: 12, leftSec: 1788, files: 1, maxFiles: 40 }),
      listBookFiles: async () => (answerFile ? [answerFile] : []),
      findBookFile: async (_bookId, fileId) => (answerFile && answerFile.id === fileId ? answerFile : null),
      findAnswerFileByToken: async (token) => (answerFile && answerFile.token === token ? answerFile : null),
      fileView: (f) => ({
        id: f.id,
        token: f.token,
        url: `${ORIGIN}/v/${f.token}`,
        kind: f.kind,
        status: f.status as "ready",
        name: f.name,
        durationSec: f.durationSec,
        sourceBytes: f.sourceBytes,
        receivedBytes: f.receivedBytes,
        error: null,
        poster: f.hasPoster ? `/api/v/${f.token}?poster=1` : null,
      }),
      mediaPackOffers: async () => [{ id: "m1", minutes: 30, price: 2900, featured: false }],
      startUpload: async () => makeAnswerFile({ status: "uploading", receivedBytes: 0 }),
      appendChunk: async (_file, offset, bytes) => {
        lastChunk = { offset, bytes };
        return offset + bytes.length;
      },
      finishUpload: async (f) => ({ ...f, status: "queued" }),
      removeFile: spyRemoveFile,
      kickAnswerFiles: () => {
        kicks += 1;
      },
      createMediaPurchase: async (_u, _b, pack) => ({ id: "mp-1", number: 7, minutes: pack.minutes, amount: pack.price }),
      serveAnswerPoster: async (_file, _req, headers) => new Response("POSTER", { headers: { "Content-Type": "image/jpeg", ...headers } }),
      serveAnswerMedia: async (_file, req, headers) => {
        if (req.range === "bytes=0-3") {
          return new Response("VIDE", {
            status: 206,
            headers: { "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Content-Range": "bytes 0-3/10", ...headers },
          });
        }
        return new Response("VIDEO-DATA", { headers: { "Content-Type": "video/mp4", "Accept-Ranges": "bytes", ...headers } });
      },
      ensureCatalog: async () => {},
      kaspiAvailable: async () => kaspiAvailable,
      kaspiPaymentProps: async (_target, defaultPhone) => ({ initial: null, defaultPhone }),
      createDesignAiPurchase: async (_u, pack) => ({
        id: "dp-1",
        number: 11,
        userId: OWNER.id,
        packId: pack.id,
        requests: pack.requests,
        amount: pack.price,
        status: "pending_payment",
        paymentId: null,
        createdAt: NOW,
        paidAt: null,
      }),
      manuscript: async (id) => (id === BOOK_ID ? { title: "Наша книга", text: "Глава 1" } : null),
      previewPdf: async (id) => (id === BOOK_ID ? Buffer.from("%PDF-1.7") : null),
      pageImage: async () => {
        if (pageImageResult === "rasterizer") throw new RasterizerMissingError();
        return pageImageResult;
      },
      pagesSpreadImage: async (bookId, kind) => (bookId === BOOK_ID && kind !== "front" ? { image: Buffer.from("WEBP-SPREAD"), version: "v42" } : null),
      coverImage: async (book) => (book.id === BOOK_ID ? Buffer.from("WEBP-COVER") : null),
      coverTemplateThumb: async (_book, tpl) => (tpl === "linen" ? Buffer.from("WEBP-THUMB") : null),
      helpThread: async () => ({ enabled: true, whatsapp: "77010000000", messages: [], hints: ["start"] }),
      helpAsk: async (_book, _user, input, locale) => {
        lastHelpLocale = locale;
        return { outcome: "answered", handoff: false, suggestions: [], messages: [{ id: "m1", from: "assistant", at: NOW.toISOString(), text: input.text }] };
      },
      designAiInfo: async () => ({ allowance: { limit: 5, used: 1, remaining: 4, credits: 0, total: 4 }, packs: [], theme: "love", hasPhotos: true }),
      runDesignAi: async (_user, _book, input, locale) => {
        lastDesignAiLocale = locale;
        return { mode: input.mode, reply: "Готово", patch: { interior: "classic" } };
      },
      hitClientAi: async () => clientAiDecision,
      proofreadConfigured: async () => proofreadOn,
      proofreadCheck: async () => {
        if (proofreadThrow) throw proofreadThrow;
        return [];
      },
      writerConfigured: async () => writerOn,
      writerRewrite: async (text) => {
        if (writerThrow) throw writerThrow;
        return `${text}!`;
      },
      misspelled: spyMisspelled,
      servePhotoFile: async (_key, req, headers) =>
        new Response(req.range ? "PART" : "JPG-BYTES", {
          status: req.range ? 206 : 200,
          headers: { ...headers, ...(req.range ? { "Content-Range": "bytes 0-3/9" } : {}) },
        }),
      coverArt: async (file) =>
        file === "linen-a5.svg"
          ? { type: "image/svg+xml; charset=utf-8", raw: "<svg/>", br: Buffer.from("BR-SVG"), gzip: Buffer.from("GZ-SVG") }
          : null,
      coverPhotoResized: async (key, width) => {
        if (key === "broken") throw new Error("missing");
        return Buffer.from(`JPEG-${key}-${width}`);
      },
      readFontFile: async (file) => (file === SAMPLE_FONT ? Buffer.from("TTF-BYTES") : null),
      fetchYoutubeTitle: async () => oembedResult,
    };

    ({ app, limiter } = await bootTestApp({
      users: [OWNER, STRANGER, STAFF_ALL, STAFF_OWN, STAFF_VIEW_ONLY],
      overrides: [
        [STAFF_ACCESS, staffAccess],
        [AUTHORING, authoringMock],
        [AUTHORING_BOOK_OWNERSHIP, { bookOwnership: async (id: string) => (id === BOOK_ID ? { managerId: STAFF_OWN.id } : null) }],
        [AUTHORING_PHOTO_LIMIT, { maxPhotos: async () => 50 }],
        [
          AUTHORING_PREVIEWS,
          {
            current: async () => null,
            build: async (id: string, opts?: { retry?: boolean }) => {
              lastBuildRetry = opts?.retry;
              return id === BOOK_ID ? { status: "ready", build: { fingerprint: BUILD_FP, pageCount: 32, contentPages: 28, pages: [] } } : null;
            },
            progressOf: (id: string) => (id === BOOK_ID ? { stage: "pdf", done: 1, total: 2 } : null),
          },
        ],
        [AUTHORING_SITE_PORTS, sitePorts],
      ],
    }));
  });

  afterAll(() => app.close());

  beforeEach(() => {
    vi.clearAllMocks();
    limiter.hits.length = 0;
    limiter.deny = false;
    books = new Map([
      [BOOK_ID, makeBook()],
      [BOOK_ORDERED_ID, makeBook({ id: BOOK_ORDERED_ID, status: "ordered" })],
      [BOOK_KK_ID, makeBook({ id: BOOK_KK_ID, language: "kk" })],
    ]);
    answerFile = makeAnswerFile();
    kicks = 0;
    lastBookPatch = null;
    lastChunk = null;
    lastUploadCount = 0;
    lastHelpLocale = null;
    lastDesignAiLocale = null;
    lastBuildRetry = undefined;
    kaspiAvailable = true;
    pageImageResult = { data: Buffer.from("WEBP-PAGE"), limited: true };
    proofreadOn = true;
    writerOn = true;
    clientAiDecision = "ok";
    proofreadThrow = null;
    writerThrow = null;
    oembedResult = { ok: true, title: "Ролик на YouTube" };
  });

  it("Группа 1 (12 маршрутов): вопросы, главы, письма, настройки и удаление книги + права CRM и 405", async () => {
    // 1. PUT /questions/order
    expect((await app.inject({ method: "PUT", url: `/api/books/${BOOK_ID}/questions/order`, headers: asOwner, payload: { sections: [{ id: Q1_ID, chapter: CH1_ID }] } })).statusCode).toBe(200);
    expect(spyReorderSections).toHaveBeenCalledTimes(1);
    expect((await app.inject({ method: "PUT", url: `/api/books/bad/questions/order`, headers: asOwner, payload: { sections: [] } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PUT", url: `/api/books/${BOOK_ID}/questions/order`, payload: { sections: [] } })).statusCode).toBe(401);

    // 2. POST /questions/{qid}/move
    expect((await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/questions/${Q1_ID}/move`, headers: asOwner, payload: { chapter: "family", beforeId: null } })).statusCode).toBe(200);
    expect(spyMoveStory).toHaveBeenCalledTimes(1);
    expect((await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/questions/${Q1_ID}/move`, headers: asOwner })).statusCode).toBe(405);

    // 3. PATCH & DELETE /questions/{qid} (оба префикса)
    for (const prefix of ["/api", "/api/v1/site"]) {
      const p = await app.inject({ method: "PATCH", url: `${prefix}/books/${BOOK_ID}/questions/${Q1_ID}`, headers: asOwner, payload: { answer: "Новый ответ" } });
      expect(p.statusCode).toBe(200);
      expect(p.json().ok).toBe(true);
      expect(p.json().updatedAt).toBeTruthy();
    }
    const delQ = await app.inject({ method: "DELETE", url: `/api/books/${BOOK_ID}/questions/${Q1_ID}`, headers: asOwner });
    expect(delQ.statusCode).toBe(200);
    expect(delQ.json()).toEqual({ ok: true, outline: null });
    const q405 = await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/questions/${Q1_ID}`, headers: asOwner });
    expect(q405.statusCode).toBe(405);
    expect(q405.headers.allow).toBe("PATCH, DELETE");

    // 4. POST /questions (раздел своей книги и свой вопрос книги с банком)
    const sec = await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/questions`, headers: asOwner, payload: { chapterKey: CH1_ID, title: "Раздел", prompt: "" } });
    expect(sec.statusCode).toBe(200);
    expect(sec.json().outline).toEqual({ chapters: [] });
    const custom = await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/questions`, headers: asOwner, payload: { afterId: Q1_ID, prompt: "Свой вопрос?" } });
    expect(custom.statusCode).toBe(200);
    expect(custom.json().question.id).toBe(Q1_ID);

    // 5-8. Главы: order, move, {key} PATCH/DELETE, POST
    expect((await app.inject({ method: "PUT", url: `/api/books/${BOOK_ID}/chapters/order`, headers: asOwner, payload: { keys: [CH1_ID] } })).statusCode).toBe(200);
    expect((await app.inject({ method: "PUT", url: `/api/books/${BOOK_ID}/chapters/move`, headers: asOwner, payload: { key: "meeting", afterKey: "family" } })).json()).toEqual({ order: ["meeting", "family"] });
    expect((await app.inject({ method: "PATCH", url: `/api/books/${BOOK_ID}/chapters/${CH1_ID}`, headers: asOwner, payload: { title: "Новая" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "PATCH", url: `/api/books/${BOOK_ID}/chapters/${CH1_ID}`, headers: asOwner, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: "DELETE", url: `/api/books/${BOOK_ID}/chapters/${CH1_ID}`, headers: asOwner })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/chapters`, headers: asOwner, payload: { title: "Глава 1" } })).json().key).toBe(CH1_ID);
    expect((await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/chapters/${CH1_ID}`, headers: asOwner })).headers.allow).toBe("PATCH, DELETE");

    // 9-11. Письма: invite, order, {lid} PATCH/DELETE
    expect((await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/letters/invite`, headers: asOwner, payload: { enabled: true, regenerate: true } })).json()).toEqual({ token: "new-inv-tok" });
    expect((await app.inject({ method: "PUT", url: `/api/books/${BOOK_ID}/letters/order`, headers: asOwner, payload: { ids: [L1_ID] } })).json()).toEqual({ ok: true });
    expect((await app.inject({ method: "PATCH", url: `/api/books/${BOOK_ID}/letters/${L1_ID}`, headers: asOwner, payload: { status: "approved" } })).json().letter.id).toBe(L1_ID);
    expect((await app.inject({ method: "DELETE", url: `/api/books/${BOOK_ID}/letters/${L1_ID}`, headers: asOwner })).json()).toEqual({ ok: true });
    expect((await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/letters/${L1_ID}`, headers: asOwner })).headers.allow).toBe("PATCH, DELETE");

    // 12. PATCH & DELETE /api/books/{id} + CSRF + CRM
    const bp = await app.inject({ method: "PATCH", url: `/api/books/${BOOK_ID}`, headers: asOwner, payload: { title: "Новое название", language: "kk" } });
    expect(bp.statusCode).toBe(200);
    expect(lastBookPatch).toMatchObject({ title: "Новое название", language: "kk", repoTag: "photo-repo" });
    expect((await app.inject({ method: "PATCH", url: `/api/books/${BOOK_ID}`, headers: { ...asOwner, origin: "https://evil.example" }, payload: { title: "x" } })).statusCode).toBe(403);
    expect((await app.inject({ method: "PATCH", url: `/api/books/${BOOK_ID}`, headers: { ...asOwner, "content-type": "application/json" }, payload: "{broken" })).statusCode).toBe(400);
    expect((await app.inject({ method: "PATCH", url: `/api/books/${BOOK_ID}`, headers: asStaffAll, payload: { title: "Правка CRM" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "PATCH", url: `/api/books/${BOOK_ID}`, headers: asStaffOwn, payload: { title: "Свой клиент" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "DELETE", url: `/api/books/${BOOK_ID}`, headers: asOwner })).json()).toEqual({ ok: true });
    expect((await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}`, headers: asOwner })).headers.allow).toBe("PATCH, DELETE");
  });

  it("Группа 2 (10 маршрутов): фото (order, batch, edit, rotate, item, upload), layout и QR-файлы (packs, item, list/start)", async () => {
    // 13-14. photos/order, photos/batch
    expect((await app.inject({ method: "PUT", url: `/api/books/${BOOK_ID}/photos/order`, headers: asOwner, payload: { ids: [P1_ID] } })).json()).toEqual({ ok: true });
    const batch = await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/photos/batch`, headers: asOwner, payload: { updates: [{ id: P1_ID, patch: { caption: "Новая" } }] } });
    expect(batch.statusCode).toBe(200);
    expect(batch.json().layoutRev).toBe(2);

    // 15. photos/{pid}/edit GET/POST/DELETE + rate limit
    expect((await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/photos/${P1_ID}/edit`, headers: asOwner })).json()).toEqual({ edit: null, version: "v1" });
    const editMp = makeMultipart([
      { name: "image", value: Buffer.from("JPG"), filename: "edit.jpg", contentType: "image/jpeg" },
      {
        name: "edit",
        value: JSON.stringify({
          v: 1,
          geometry: { turns: 0, flip: false, straighten: 0, crop: null, aspect: "free" },
          adjust: {},
          levels: null,
          filter: { id: "none", strength: 100 },
          layers: [],
        }),
      },
      { name: "version", value: "v1" },
    ]);
    const editPost = await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/photos/${P1_ID}/edit`, headers: { ...asOwner, "content-type": editMp.contentType }, payload: editMp.payload });
    expect(editPost.statusCode).toBe(200);
    expect(editPost.json().edited).toBe(true);
    expect(spyPhotoSaveEdit).toHaveBeenCalledTimes(1);

    const badEditMp = makeMultipart([{ name: "edit", value: "not-json" }, { name: "version", value: "v1" }]);
    expect((await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/photos/${P1_ID}/edit`, headers: { ...asOwner, "content-type": badEditMp.contentType }, payload: badEditMp.payload })).statusCode).toBe(400);

    limiter.deny = true;
    expect((await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/photos/${P1_ID}/edit`, headers: { ...asOwner, "content-type": editMp.contentType }, payload: editMp.payload })).statusCode).toBe(429);
    limiter.deny = false;

    expect((await app.inject({ method: "DELETE", url: `/api/books/${BOOK_ID}/photos/${P1_ID}/edit`, headers: asOwner })).json().edited).toBe(false);
    expect((await app.inject({ method: "PATCH", url: `/api/books/${BOOK_ID}/photos/${P1_ID}/edit`, headers: asOwner })).headers.allow).toBe("GET, POST, DELETE");

    // 16-19. rotate, photo item, photo upload, layout
    expect((await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/photos/${P1_ID}/rotate`, headers: asOwner })).json().photo.id).toBe(P1_ID);
    expect((await app.inject({ method: "PATCH", url: `/api/books/${BOOK_ID}/photos/${P1_ID}`, headers: asOwner, payload: { caption: "Подпись" } })).json().layoutRev).toBe(2);
    expect((await app.inject({ method: "DELETE", url: `/api/books/${BOOK_ID}/photos/${P1_ID}`, headers: asOwner })).json()).toEqual({ ok: true });

    const upMp = makeMultipart([
      { name: "files", value: Buffer.from("IMG1"), filename: "a.jpg", contentType: "image/jpeg" },
      { name: "files", value: Buffer.alloc(0), filename: "empty.jpg", contentType: "image/jpeg" },
      { name: "other", value: Buffer.from("IGN"), filename: "x.jpg", contentType: "image/jpeg" },
    ]);
    const up = await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/photos`, headers: { ...asOwner, [LOCALE_HEADER]: "kk", "content-type": upMp.contentType }, payload: upMp.payload });
    expect(up.statusCode).toBe(200);
    expect(lastUploadCount).toBe(1);
    expect(up.json().errors).toHaveLength(2);

    expect((await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/layout`, headers: asOwner })).json().layoutRev).toBe(2);

    // 20. files/packs
    const validMediaPack = getMediaPacks().find((p) => !p.hidden && p.price > 0);
    if (validMediaPack) {
      const mp = await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/files/packs`, headers: asOwner, payload: { packId: validMediaPack.id } });
      expect(mp.statusCode).toBe(200);
      expect(mp.json().purchase.minutes).toBe(validMediaPack.minutes);
    }
    expect((await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/files/packs`, headers: asOwner, payload: { packId: "no-such-pack" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: `/api/books/${BOOK_ORDERED_ID}/files/packs`, headers: asOwner, payload: { packId: "any" } })).statusCode).toBe(409);

    // 21-22. files list, start, item GET/PUT/POST/DELETE + binary octet-stream + 413 + staff view-only 404
    const fl = await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/files`, headers: asOwner });
    expect(fl.statusCode).toBe(200);
    expect(fl.json().packs).toHaveLength(1);
    kaspiAvailable = false;
    expect((await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/files`, headers: asOwner })).json().packs).toEqual([]);

    const started = await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/files`, headers: asOwner, payload: { name: "clip.mp4", size: 1024, type: "video/mp4", durationSec: 12 } });
    expect(started.statusCode).toBe(200);
    expect(started.json().chunkBytes).toBe(FILE_CHUNK_BYTES);
    expect((await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/files`, headers: asStaffView, payload: { name: "clip.mp4", size: 1024 } })).statusCode).toBe(404);

    expect((await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/files/${FILE1_ID}`, headers: asOwner })).json().file.id).toBe(FILE1_ID);

    const chunkPayload = Buffer.from([1, 2, 3, 4, 5, 6]);
    const putChunk = await app.inject({
      method: "PUT",
      url: `/api/books/${BOOK_ID}/files/${FILE1_ID}?offset=0`,
      headers: { ...asOwner, "content-type": "application/octet-stream" },
      payload: chunkPayload,
    });
    expect(putChunk.statusCode).toBe(200);
    expect(putChunk.json()).toEqual({ received: 6 });
    expect(lastChunk?.bytes.equals(chunkPayload)).toBe(true);

    const tooBig = await app.inject({
      method: "PUT",
      url: `/api/books/${BOOK_ID}/files/${FILE1_ID}?offset=0`,
      headers: { ...asOwner, "content-type": "application/octet-stream", "content-length": String(FILE_CHUNK_BYTES + 1) },
      payload: Buffer.from("x"),
    });
    expect(tooBig.statusCode).toBe(413);
    expect(tooBig.json().code).toBe("fileChunk");

    const fin = await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/files/${FILE1_ID}`, headers: asOwner });
    expect(fin.statusCode).toBe(200);
    expect(fin.json().file.status).toBe("queued");
    expect(kicks).toBe(1);

    expect((await app.inject({ method: "DELETE", url: `/api/books/${BOOK_ID}/files/${FILE1_ID}`, headers: asOwner })).json()).toEqual({ ok: true });
    expect(spyRemoveFile).toHaveBeenCalledTimes(1);
    expect((await app.inject({ method: "PATCH", url: `/api/books/${BOOK_ID}/files/${FILE1_ID}`, headers: asOwner })).statusCode).toBe(405);
  });

  it("Группа 3 (8 маршрутов): export, preview, page-raster, pages-image, cover-image, cover-thumb, build, build-progress", async () => {
    // 23. export
    const exp = await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/export`, headers: asOwner });
    expect(exp.statusCode).toBe(200);
    expect(exp.body.startsWith("\uFEFFГлава 1")).toBe(true);
    expect(exp.headers["content-disposition"]).toContain('attachment; filename="book.txt"');

    // 24. preview PDF
    const pdf = await app.inject({ method: "GET", url: `/api/v1/site/books/${BOOK_ID}/preview`, headers: asOwner });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.headers["content-disposition"]).toContain('inline; filename="preview.pdf"');

    // 25. page-raster + ETag/304 + 503 rasterizer + 400 + 404
    const p1 = await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/pages/${BUILD_FP}/1?w=1200`, headers: asOwner });
    expect(p1.statusCode).toBe(200);
    expect(p1.headers["cache-control"]).toBe("private, no-cache");
    const etag = String(p1.headers.etag);
    const p304 = await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/pages/${BUILD_FP}/1?w=1200`, headers: { ...asOwner, "if-none-match": `"other", ${etag}` } });
    expect(p304.statusCode).toBe(304);

    pageImageResult = { data: Buffer.from("WEBP-FULL"), limited: false };
    expect((await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/pages/${BUILD_FP}/1?w=1200`, headers: asOwner })).headers["cache-control"]).toBe("private, max-age=31536000, immutable");
    pageImageResult = "rasterizer";
    expect((await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/pages/${BUILD_FP}/1?w=1200`, headers: asOwner })).statusCode).toBe(503);
    pageImageResult = null;
    expect((await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/pages/${BUILD_FP}/1?w=1200`, headers: asOwner })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/pages/badfp/1?w=1200`, headers: asOwner })).statusCode).toBe(400);

    // 26. pages-image
    const pi = await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/pages-image?kind=chapter&w=600`, headers: asOwner });
    expect(pi.statusCode).toBe(200);
    expect(pi.headers.etag).toBe('"v42-chapter-600"');
    expect((await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/pages-image?kind=bad`, headers: asOwner })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/pages-image?kind=front`, headers: asOwner })).statusCode).toBe(404);

    // 27. cover-image
    const ci = await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/cover-image?w=480&side=spread&p=100`, headers: asOwner });
    expect(ci.statusCode).toBe(200);
    expect(ci.headers["content-type"]).toBe("image/webp");
    expect((await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/cover-image?template=nonexistent`, headers: asOwner })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/cover-image?side=spread&p=0`, headers: asOwner })).statusCode).toBe(400);

    // 28. cover-thumb
    expect((await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/cover-thumb/linen`, headers: asOwner })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/cover-thumb/unknown`, headers: asOwner })).statusCode).toBe(404);

    // 29-30. build & build-progress
    const bld = await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/build?retry=1`, headers: asOwner });
    expect(bld.statusCode).toBe(200);
    expect(bld.headers["cache-control"]).toBe("private, no-store");
    expect(lastBuildRetry).toBe(true);
    const prog = await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/build-progress`, headers: asOwner });
    expect(prog.statusCode).toBe(200);
    expect(prog.json()).toEqual({ progress: { stage: "pdf", done: 1, total: 2 } });
    expect((await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/build-progress`, headers: asStranger })).statusCode).toBe(404);
  });

  it("Группа 4 (5 маршрутов): help, design-ai, proofread/ai, proofread/spell, write/ai", async () => {
    // 31. help GET/POST
    const hg = await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/help`, headers: asOwner });
    expect(hg.statusCode).toBe(200);
    expect(hg.headers["cache-control"]).toBe("no-store");
    const hp = await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/help`, headers: { ...asOwner, [LOCALE_HEADER]: "kk" }, payload: { text: "Как добавить фото?" } });
    expect(hp.statusCode).toBe(200);
    expect(lastHelpLocale).toBe("kk");

    // 32. design-ai GET/POST
    expect((await app.inject({ method: "GET", url: `/api/books/${BOOK_ID}/design-ai`, headers: asOwner })).statusCode).toBe(200);
    const da = await app.inject({
      method: "POST",
      url: `/api/books/${BOOK_ID}/design-ai`,
      headers: { ...asOwner, [LOCALE_HEADER]: "uz" },
      payload: { target: "pages", mode: "edit", prompt: "Сделай светлее", state: { interior: "classic", style: {} } },
    });
    expect(da.statusCode).toBe(200);
    expect(lastDesignAiLocale).toBe("uz");
    expect((await app.inject({ method: "POST", url: `/api/books/${BOOK_ORDERED_ID}/design-ai`, headers: asOwner, payload: { target: "pages", mode: "edit", prompt: "Сделай светлее", state: { interior: "classic", style: {} } } })).statusCode).toBe(409);

    // 33. proofread/ai
    expect((await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/proofread/ai`, headers: asOwner, payload: { text: "Привет мир" } })).json()).toEqual({ issues: [] });
    proofreadOn = false;
    expect((await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/proofread/ai`, headers: asOwner, payload: { text: "Привет мир" } })).statusCode).toBe(503);
    proofreadOn = true;
    clientAiDecision = "short";
    expect((await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/proofread/ai`, headers: asOwner, payload: { text: "Привет мир" } })).statusCode).toBe(429);
    clientAiDecision = "ok";
    proofreadThrow = new AssistantError("unavailable", "upstream down");
    expect((await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/proofread/ai`, headers: asOwner, payload: { text: "Привет мир" } })).statusCode).toBe(502);

    // 34. proofread/spell (ru vs kk + rate limit)
    expect((await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/proofread/spell`, headers: asOwner, payload: { words: ["приввет"] } })).json()).toEqual({ wrong: { приввет: ["привет"] } });
    expect((await app.inject({ method: "POST", url: `/api/books/${BOOK_KK_ID}/proofread/spell`, headers: asOwner, payload: { words: ["сәлем"] } })).json()).toEqual({ wrong: {} });
    expect(spyMisspelled).toHaveBeenCalledTimes(1);
    limiter.deny = true;
    expect((await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/proofread/spell`, headers: asOwner, payload: { words: ["приввет"] } })).statusCode).toBe(429);
    limiter.deny = false;

    // 35. write/ai
    expect((await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/write/ai`, headers: asOwner, payload: { text: "Текст", mode: "improve" } })).json()).toEqual({ text: "Текст!" });
    expect((await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/write/ai`, headers: asOwner, payload: { text: "Текст", mode: "custom" } })).statusCode).toBe(400);
    writerOn = false;
    expect((await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/write/ai`, headers: asOwner, payload: { text: "Текст", mode: "improve" } })).statusCode).toBe(503);
    writerOn = true;
    writerThrow = new AssistantError("unavailable", "busy");
    expect((await app.inject({ method: "POST", url: `/api/books/${BOOK_ID}/write/ai`, headers: asOwner, payload: { text: "Текст", mode: "improve" } })).statusCode).toBe(502);
  });

  it("Группа 5 (7 маршрутов): /api/v/{token}, /design-ai/packs, /media/oembed, /fonts/{file}, /photos/{id}, /covers/{file}, /cover-photos/{key}", async () => {
    // 36. /api/v/{token} (media, Range 206, download, poster, 404, 405)
    const vRange = await app.inject({ method: "GET", url: `/api/v/${FILE_TOKEN}`, headers: { range: "bytes=0-3" } });
    expect(vRange.statusCode).toBe(206);
    expect(vRange.headers["x-robots-tag"]).toBe("noindex");
    expect(vRange.body).toBe("VIDE");
    const vDl = await app.inject({ method: "GET", url: `/api/v1/site/v/${FILE_TOKEN}?download=1` });
    expect(vDl.headers["content-disposition"]).toBe(`attachment; filename="mybooks-${FILE_TOKEN}.mp4"`);
    expect((await app.inject({ method: "GET", url: `/api/v/${FILE_TOKEN}?poster=1` })).body).toBe("POSTER");
    expect((await app.inject({ method: "GET", url: "/api/v/short" })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: `/api/v/${FILE_TOKEN}` })).headers.allow).toBe("GET");

    // 37. /api/design-ai/packs
    const aiPack = getAiPacks().find((p) => !p.hidden);
    if (aiPack) {
      const res = await app.inject({ method: "POST", url: "/api/design-ai/packs", headers: asOwner, payload: { packId: aiPack.id } });
      expect(res.statusCode).toBe(200);
      expect(res.json().purchase.requests).toBe(aiPack.requests);
    }
    expect((await app.inject({ method: "POST", url: "/api/design-ai/packs", headers: asOwner, payload: { packId: "unknown" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/api/design-ai/packs", payload: { packId: "x" } })).statusCode).toBe(401);

    // 38. /api/media/oembed
    const oe = await app.inject({ method: "GET", url: "/api/media/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ", headers: asOwner });
    expect(oe.statusCode).toBe(200);
    expect(oe.json()).toEqual({ title: "Ролик на YouTube" });
    expect(oe.headers["cache-control"]).toBe("private, max-age=3600");
    oembedResult = { ok: false };
    const oeFail = await app.inject({ method: "GET", url: "/api/media/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ", headers: asOwner });
    expect(oeFail.json()).toEqual({ title: null });
    expect(oeFail.headers["cache-control"]).toBeUndefined();

    // 39. /api/fonts/{file}
    const fnt = await app.inject({ method: "GET", url: `/api/fonts/${SAMPLE_FONT}` });
    expect(fnt.statusCode).toBe(200);
    expect(fnt.headers["content-type"]).toBe("font/ttf");
    expect((await app.inject({ method: "GET", url: "/api/fonts/evil.ttf" })).statusCode).toBe(404);

    // 40. /api/photos/{id} (thumb/view/ETag/304/404)
    const ph1 = await app.inject({ method: "GET", url: `/api/photos/${P1_ID}`, headers: asOwner });
    expect(ph1.statusCode).toBe(200);
    expect(ph1.headers["cache-control"]).toBe("private, no-cache");
    const ph304 = await app.inject({ method: "GET", url: `/api/photos/${P1_ID}`, headers: { ...asOwner, "if-none-match": String(ph1.headers.etag) } });
    expect(ph304.statusCode).toBe(304);
    const phView = await app.inject({ method: "GET", url: `/api/photos/${P1_ID}?size=view`, headers: asOwner });
    expect(phView.body).toBe("VIEW-JPG");
    expect(phView.headers["cache-control"]).toBe("private, max-age=60, must-revalidate");
    expect((await app.inject({ method: "GET", url: `/api/photos/${P1_ID}`, headers: asStranger })).statusCode).toBe(404);

    // 41. /api/covers/{file} (raw / gzip / br + Vary)
    const covBr = await app.inject({ method: "GET", url: "/api/covers/linen-a5.svg", headers: { "accept-encoding": "gzip, br" } });
    expect(covBr.statusCode).toBe(200);
    expect(covBr.headers["content-encoding"]).toBe("br");
    expect(covBr.headers.vary).toBe("Accept-Encoding");
    expect(covBr.body).toBe("BR-SVG");
    const covGz = await app.inject({ method: "GET", url: "/api/covers/linen-a5.svg", headers: { "accept-encoding": "gzip" } });
    expect(covGz.headers["content-encoding"]).toBe("gzip");
    expect((await app.inject({ method: "GET", url: "/api/covers/unknown.svg" })).statusCode).toBe(404);

    // 42. /api/cover-photos/{key}
    const cp = await app.inject({ method: "GET", url: "/api/cover-photos/bg1?w=500" });
    expect(cp.statusCode).toBe(200);
    expect(cp.body).toBe("JPEG-bg1-900");
    expect((await app.inject({ method: "GET", url: "/api/cover-photos/..%2Fsecret.jpg" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/api/cover-photos/broken" })).statusCode).toBe(404);
  });
});
