import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getAiPacks, getMediaPacks } from "@/config/site";
import { LOCALE_HEADER } from "@/i18n/config";
import { FILE_CHUNK_BYTES } from "@/lib/book/answer-files";
import { fontFiles } from "@/lib/book/fonts";
import { AssistantError } from "@/modules/assistant";
import { AuthoringError, isBookVisibleTo, type BookRow, type BookViewer, type LetterRow, type PhotoRow, type QuestionRow } from "@/modules/authoring";
import { RasterizerMissingError } from "@/modules/production";
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
const ALL_USERS = [OWNER, STRANGER];

const BOOK_ID = "aaaa1111-1111-4111-8111-111111111111";
const BOOK_ORDERED_ID = "aaaa2222-2222-4222-8222-222222222222";
const Q1_ID = "bbbb1111-1111-4111-8111-111111111111";
const CH1_ID = "bbbb2222-2222-4222-8222-222222222222";
const P1_ID = "cccc1111-1111-4111-8111-111111111111";
const L1_ID = "dddd1111-1111-4111-8111-111111111111";
const FILE1_ID = "eeee1111-1111-4111-8111-111111111111";
const FILE_TOKEN = "AbCdEf1234";
const BUILD_FP = "0123456789abcdef";
const SAMPLE_FONT = [...fontFiles][0];
const ORIGIN = "http://localhost:3000";
const FIXED_NOW = new Date("2026-11-26T10:00:00.000Z");

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
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
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
  createdAt: FIXED_NOW,
  updatedAt: FIXED_NOW,
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
  createdAt: FIXED_NOW,
  updatedAt: FIXED_NOW,
};

const sampleLetter: LetterRow = {
  id: L1_ID,
  bookId: BOOK_ID,
  authorName: "Сестра",
  relation: "сестра",
  text: "Поздравляю!",
  status: "approved",
  position: 0,
  createdAt: FIXED_NOW,
  updatedAt: FIXED_NOW,
};

const sampleAnswerFile: SiteAnswerFileRow = {
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
  createdAt: FIXED_NOW,
  updatedAt: FIXED_NOW,
};

const shared = vi.hoisted(() => ({
  allowRate: true,
  clientAi: "ok" as "ok" | "short" | "long",
  proofreadOn: true,
  writerOn: true,
  proofreadErr: null as Error | null,
  pageImageMode: "ok" as "ok" | "rasterizer" | "missing",
  kaspiAvailable: true,
  oembedOk: true,
}));

const booksMap = new Map<string, BookRow>([
  [BOOK_ID, makeBook()],
  [BOOK_ORDERED_ID, makeBook({ id: BOOK_ORDERED_ID, status: "ordered" })],
]);

const viewOfFile = (f: SiteAnswerFileRow) => ({
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
});

vi.mock("next/headers", () => import("@/server/http/next-shim"));
vi.mock("next/server", () => import("@/server/http/next-shim"));
vi.mock("next/navigation", () => import("@/server/http/next-shim"));
vi.mock("@/server/rateLimit", () => ({
  rateLimit: async () => shared.allowRate,
  trustedClientIp: async () => "203.0.113.10",
}));
vi.mock("@/server/auth", async () => {
  const shim = await import("@/server/http/next-shim");
  return {
    getCurrentUser: async () => {
      const jar = await shim.cookies();
      const hdrs = await shim.headers();
      const bearer = hdrs.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{20,200})$/)?.[1] ?? null;
      const tok = jar.get("mb_session")?.value ?? bearer;
      return tok ? ALL_USERS.find((u) => sessionOf(u) === tok) ?? null : null;
    },
  };
});
vi.mock("@/server/books", () => ({
  viewerOf: async (user: { id: string }) => ({ userId: user.id, isStaff: false, staffEdits: false }),
}));
vi.mock("@/server/photoLimit", () => ({ maxPhotos: async () => 50 }));
vi.mock("@/server/catalog", () => ({ ensureCatalog: async () => {}, syncCatalogFromSettings: async () => {} }));
vi.mock("@/web/catalog", () => ({ ensureCatalog: async () => {} }));
vi.mock("@/server/kaspi-view", () => ({
  kaspiPaymentProps: async (_target: unknown, defaultPhone: string) => ({ initial: null, defaultPhone }),
}));
vi.mock("@/server/designAiStore", () => ({
  createDesignAiPurchase: async (_u: string, pack: { id: string; requests: number; price: number }) => ({
    id: "dp-1",
    number: 11,
    userId: OWNER.id,
    packId: pack.id,
    requests: pack.requests,
    amount: pack.price,
    status: "pending",
    paymentId: null,
    createdAt: FIXED_NOW,
    paidAt: null,
  }),
}));
vi.mock("@/server/answerFiles", () => ({
  bookFileQuota: async () => ({ minutes: 30, usedSec: 12, leftSec: 1788, files: 1, maxFiles: 40 }),
  listBookFiles: async () => [sampleAnswerFile],
  findBookFile: async (_bookId: string, fileId: string) => (fileId === FILE1_ID ? sampleAnswerFile : null),
  findByToken: async (token: string) => (token === FILE_TOKEN ? sampleAnswerFile : null),
  fileView: (f: SiteAnswerFileRow) => viewOfFile(f),
  mediaPackOffers: async () => [{ id: "m1", minutes: 30, price: 2900, featured: false }],
  startUpload: async () => ({ ...sampleAnswerFile, status: "uploading", receivedBytes: 0 }),
  appendChunk: async (_file: SiteAnswerFileRow, offset: number, bytes: Buffer) => offset + bytes.length,
  finishUpload: async (f: SiteAnswerFileRow) => ({ ...f, status: "queued" }),
  removeFile: async () => {},
  createMediaPurchase: async (_u: string, _b: string, pack: { minutes: number; price: number }) => ({ id: "mp-1", number: 7, minutes: pack.minutes, amount: pack.price }),
  mediaKey: () => "answer/media.mp4",
  posterKey: () => "answer/poster.jpg",
  mediaMime: () => "video/mp4",
  openMedia: async () => null,
  openPoster: async () => null,
}));
vi.mock("@/server/answerFilesWorker", () => ({ kickAnswerFiles: () => {} }));
vi.mock("@/server/range-file", () => ({
  serveStorageFile: async (key: string, mime: string, req: Request, headers: Record<string, string>) => {
    const range = req.headers.get("range");
    if (range === "bytes=0-3") {
      return new Response("PART", {
        status: 206,
        headers: { "Content-Type": mime, "Accept-Ranges": "bytes", "Content-Range": "bytes 0-3/10", ...headers },
      });
    }
    return new Response(`FILE:${key}`, { headers: { "Content-Type": mime, "Accept-Ranges": "bytes", ...headers } });
  },
}));
vi.mock("@/server/book-help", () => ({
  helpThread: async () => ({ enabled: true, whatsapp: "77010000000", messages: [], hints: ["start"] }),
  helpAsk: async (_b: unknown, _u: unknown, input: { text: string }, locale: string) => ({
    outcome: "answered",
    handoff: false,
    suggestions: [],
    messages: [{ id: "m1", from: "assistant", at: FIXED_NOW.toISOString(), text: `${locale}:${input.text}` }],
  }),
}));
vi.mock("@/server/design-ai-request", async (orig) => {
  const actual = await orig<typeof import("@/server/design-ai-request")>();
  return {
    designAiBody: actual.designAiBody,
    designAiInfo: async () => ({ allowance: { limit: 5, used: 1, remaining: 4, credits: 0, total: 4 }, packs: [], theme: "love", hasPhotos: true }),
    runDesignAiRequest: async (_u: unknown, _b: unknown, input: { mode: string }) => ({ mode: input.mode, reply: "Готово", patch: { interior: "classic" } }),
  };
});
vi.mock("@/server/clientAiLimits", () => ({ hitClientAi: async () => shared.clientAi }));
vi.mock("@/server/spell", () => ({ misspelled: async () => ({ приввет: ["привет"] }) }));
vi.mock("@/server/pages-image", async (orig) => {
  const actual = await orig<typeof import("@/server/pages-image")>();
  return {
    PAGES_IMAGE_WIDTHS: actual.PAGES_IMAGE_WIDTHS,
    PAGES_SPREADS: actual.PAGES_SPREADS,
    pagesSpreadImage: async (_id: string, kind: string) => (kind === "chapter" ? { image: Buffer.from("WEBP-SPREAD"), version: "v42" } : null),
  };
});
vi.mock("@/server/cover-image", async (orig) => {
  const actual = await orig<typeof import("@/server/cover-image")>();
  return {
    COVER_IMAGE_WIDTHS: actual.COVER_IMAGE_WIDTHS,
    coverVersion: actual.coverVersion,
    coverImage: async (book: BookRow) => (book.id === BOOK_ID ? Buffer.from("WEBP-COVER") : null),
    coverTemplateThumb: async (_book: BookRow, tpl: string) => (tpl === "linen" ? Buffer.from("WEBP-THUMB") : null),
  };
});
vi.mock("@/server/cover-art", () => ({
  getCoverArt: async (file: string) =>
    file === "linen-a5.svg"
      ? { type: "image/svg+xml; charset=utf-8", raw: "<svg/>", br: Buffer.from("BR-SVG"), gzip: Buffer.from("GZ-SVG") }
      : null,
}));
vi.mock("@/modules/production", async (orig) => {
  const actual = await orig<typeof import("@/modules/production")>();
  return {
    ...actual,
    coverPhotoResized: async (key: string, width: number) => {
      if (key === "broken") throw new Error("missing");
      return Buffer.from(`JPEG-${key}-${width}`);
    },
  };
});

const authoringFacade = {
  photoRepository: {},
  books: {
    updateSettings: async (id: string, viewer: BookViewer) => {
      const b = booksMap.get(id);
      if (!b || !isBookVisibleTo(b.userId, viewer)) throw new AuthoringError("bookNotFound");
    },
    delete: async () => {},
    setLetterInvite: async () => "inv-new",
  },
  questions: {
    edit: async () => {},
    deleteCustom: async () => null,
    moveStory: async () => {},
    addCustom: async () => Q1_ID,
    moveChapter: async () => ["meeting", "family"],
  },
  outline: {
    addSection: async () => ({ id: Q1_ID, outline: { chapters: [] } }),
    reorderSections: async () => ({ chapters: [] }),
    addChapter: async () => ({ key: CH1_ID, sectionId: Q1_ID, outline: { chapters: [] } }),
    renameChapter: async () => ({ chapters: [] }),
    deleteChapter: async () => ({ chapters: [] }),
    reorderChapters: async () => ({ chapters: [] }),
  },
  photos: {
    reorder: async () => {},
    batch: async () => {},
    update: async () => {},
    delete: async () => {},
    rotate: async () => {},
    editState: async () => ({ edit: null, version: "v1" }),
    saveEdit: async () => {},
    revertEdit: async () => {},
    originalKey: async (p: PhotoRow) => `orig/${p.storageKey}`,
    upgradeLayout: async () => 2,
    upload: async () => ({ created: [{ id: P1_ID }], failed: [{ name: "big.jpg", reason: "tooBig" as const }], damaged: [] }),
  },
  letters: {
    reorder: async () => {},
    edit: async () => {},
    delete: async () => {},
  },
  photoViewFile: async () => Buffer.from("VIEW-JPG"),
  photoStream: async () => null,
  queries: {
    book: async (id: string) => booksMap.get(id) ?? null,
    visibleBook: async (id: string, viewer: BookViewer) => {
      const b = booksMap.get(id);
      return b && isBookVisibleTo(b.userId, viewer) ? b : null;
    },
    questions: async () => [sampleQuestion],
    photos: async () => [samplePhoto],
    letters: async () => [sampleLetter],
    photoBookId: async (pid: string) => (pid === P1_ID ? BOOK_ID : null),
    photoFor: async (pid: string, viewer: BookViewer) => (pid === P1_ID && isBookVisibleTo(OWNER.id, viewer) ? samplePhoto : null),
  },
};

vi.mock("@/server/container", () => ({
  container: () => ({
    authoring: authoringFacade,
    ordering: { kaspi: { available: async () => shared.kaspiAvailable } },
    previews: {
      manuscript: async (id: string) => (id === BOOK_ID ? { title: "Наша книга", text: "Глава 1" } : null),
      preview: async (id: string) => (id === BOOK_ID ? Buffer.from("%PDF-1.7") : null),
      pageImage: async () => {
        if (shared.pageImageMode === "rasterizer") throw new RasterizerMissingError();
        if (shared.pageImageMode === "missing") return null;
        return { data: Buffer.from("WEBP-PAGE"), limited: true };
      },
      build: async (id: string) => (id === BOOK_ID ? { status: "ready", build: { fingerprint: BUILD_FP, pageCount: 32, contentPages: 28, pages: [] } } : null),
      progressOf: (id: string) => (id === BOOK_ID ? { stage: "pdf", done: 1, total: 2 } : null),
    },
    assistant: {
      proofreader: {
        configured: async () => shared.proofreadOn,
        check: async () => {
          if (shared.proofreadErr) throw shared.proofreadErr;
          return [];
        },
      },
      writer: {
        configured: async () => shared.writerOn,
        rewrite: async (text: string) => `${text}!`,
      },
    },
  }),
}));

const { assertRoute } = await import("./expected");

const asOwner = { cookie: `mb_session=${sessionOf(OWNER)}`, origin: ORIGIN };
const asStranger = { cookie: `mb_session=${sessionOf(STRANGER)}`, origin: ORIGIN };
const originBad = { cookie: `mb_session=${sessionOf(OWNER)}`, origin: "https://evil.example" };

describe("ответы Nest байт в байт (эталон — прежний mybook-api): 42 маршрута сайта Authoring", () => {
  let app: NestFastifyApplication;
  let limiter: FakeLimiter;
  const origFetch = globalThis.fetch;

  beforeAll(async () => {
    vi.useFakeTimers({ now: FIXED_NOW, toFake: ["Date"] });
    globalThis.fetch = (async () => {
      if (!shared.oembedOk) throw new Error("network");
      return Response.json({ title: "  Ролик   YouTube  " });
    }) as typeof fetch;

    const nestPorts: AuthoringSitePorts = {
      bookFileQuota: async () => ({ minutes: 30, usedSec: 12, leftSec: 1788, files: 1, maxFiles: 40 }),
      listBookFiles: async () => [sampleAnswerFile],
      findBookFile: async (_bookId, fileId) => (fileId === FILE1_ID ? sampleAnswerFile : null),
      findAnswerFileByToken: async (token) => (token === FILE_TOKEN ? sampleAnswerFile : null),
      fileView: viewOfFile,
      mediaPackOffers: async () => [{ id: "m1", minutes: 30, price: 2900, featured: false }],
      startUpload: async () => ({ ...sampleAnswerFile, status: "uploading", receivedBytes: 0 }),
      appendChunk: async (_f, offset, bytes) => offset + bytes.length,
      finishUpload: async (f) => ({ ...f, status: "queued" }),
      removeFile: async () => {},
      kickAnswerFiles: () => {},
      createMediaPurchase: async (_u, _b, pack) => ({ id: "mp-1", number: 7, minutes: pack.minutes, amount: pack.price }),
      serveAnswerPoster: async (_f, _req, headers) =>
        new Response("FILE:answer/poster.jpg", { headers: { "Content-Type": "image/jpeg", "Accept-Ranges": "bytes", ...headers } }),
      serveAnswerMedia: async (_f, req, headers) =>
        req.range === "bytes=0-3"
          ? new Response("PART", { status: 206, headers: { "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Content-Range": "bytes 0-3/10", ...headers } })
          : new Response("FILE:answer/media.mp4", { headers: { "Content-Type": "video/mp4", "Accept-Ranges": "bytes", ...headers } }),
      ensureCatalog: async () => {},
      kaspiAvailable: async () => shared.kaspiAvailable,
      kaspiPaymentProps: async (_t, defaultPhone) => ({ initial: null, defaultPhone }),
      createDesignAiPurchase: async (_u, pack) => ({
        id: "dp-1",
        number: 11,
        userId: OWNER.id,
        packId: pack.id,
        requests: pack.requests,
        amount: pack.price,
        status: "pending_payment",
        paymentId: null,
        createdAt: FIXED_NOW,
        paidAt: null,
      }),
      manuscript: async (id) => (id === BOOK_ID ? { title: "Наша книга", text: "Глава 1" } : null),
      previewPdf: async (id) => (id === BOOK_ID ? Buffer.from("%PDF-1.7") : null),
      pageImage: async () => {
        if (shared.pageImageMode === "rasterizer") throw new RasterizerMissingError();
        if (shared.pageImageMode === "missing") return null;
        return { data: Buffer.from("WEBP-PAGE"), limited: true };
      },
      pagesSpreadImage: async (_id, kind) => (kind === "chapter" ? { image: Buffer.from("WEBP-SPREAD"), version: "v42" } : null),
      coverImage: async (book) => (book.id === BOOK_ID ? Buffer.from("WEBP-COVER") : null),
      coverTemplateThumb: async (_book, tpl) => (tpl === "linen" ? Buffer.from("WEBP-THUMB") : null),
      helpThread: async () => ({ enabled: true, whatsapp: "77010000000", messages: [], hints: ["start"] }),
      helpAsk: async (_b, _u, input, locale) => ({
        outcome: "answered",
        handoff: false,
        suggestions: [],
        messages: [{ id: "m1", from: "assistant", at: FIXED_NOW.toISOString(), text: `${locale}:${input.text}` }],
      }),
      designAiInfo: async () => ({ allowance: { limit: 5, used: 1, remaining: 4, credits: 0, total: 4 }, packs: [], theme: "love", hasPhotos: true }),
      runDesignAi: async (_u, _b, input) => ({ mode: input.mode, reply: "Готово", patch: { interior: "classic" } }),
      hitClientAi: async () => shared.clientAi,
      proofreadConfigured: async () => shared.proofreadOn,
      proofreadCheck: async () => {
        if (shared.proofreadErr) throw shared.proofreadErr;
        return [];
      },
      writerConfigured: async () => shared.writerOn,
      writerRewrite: async (text) => `${text}!`,
      misspelled: async () => ({ приввет: ["привет"] }),
      servePhotoFile: async (key, req, headers) =>
        req.range === "bytes=0-3"
          ? new Response("PART", { status: 206, headers: { "Content-Type": "image/jpeg", "Accept-Ranges": "bytes", "Content-Range": "bytes 0-3/10", ...headers } })
          : new Response(`FILE:${key}`, { headers: { "Content-Type": "image/jpeg", "Accept-Ranges": "bytes", ...headers } }),
      coverArt: async (file) =>
        file === "linen-a5.svg"
          ? { type: "image/svg+xml; charset=utf-8", raw: "<svg/>", br: Buffer.from("BR-SVG"), gzip: Buffer.from("GZ-SVG") }
          : null,
      coverPhotoResized: async (key, width) => {
        if (key === "broken") throw new Error("missing");
        return Buffer.from(`JPEG-${key}-${width}`);
      },
      readFontFile: async (file) => {
        const { readFile } = await import("node:fs/promises");
        const path = await import("node:path");
        return readFile(path.join(process.cwd(), "assets", "fonts", file)).catch(() => null);
      },
      fetchYoutubeTitle: async (videoId) => {
        if (!shared.oembedOk) return { ok: false };
        const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`);
        const data = (await res.json()) as { title?: string };
        return { ok: true, title: data.title?.replace(/\s+/g, " ").trim() ?? null };
      },
    };

    ({ app, limiter } = await bootTestApp({
      users: ALL_USERS,
      overrides: [
        [AUTHORING, authoringFacade],
        [AUTHORING_BOOK_OWNERSHIP, { bookOwnership: async () => null }],
        [AUTHORING_PHOTO_LIMIT, { maxPhotos: async () => 50 }],
        [
          AUTHORING_PREVIEWS,
          {
            current: async () => null,
            build: async (id: string) => (id === BOOK_ID ? { status: "ready", build: { fingerprint: BUILD_FP, pageCount: 32, contentPages: 28, pages: [] } } : null),
            progressOf: (id: string) => (id === BOOK_ID ? { stage: "pdf", done: 1, total: 2 } : null),
          },
        ],
        [AUTHORING_SITE_PORTS, nestPorts],
      ],
    }));
  });

  afterAll(async () => {
    globalThis.fetch = origFetch;
    vi.useRealTimers();
    await app.close();
  });

  beforeEach(() => {
    limiter.hits.length = 0;
    limiter.deny = false;
    shared.allowRate = true;
    shared.clientAi = "ok";
    shared.proofreadOn = true;
    shared.writerOn = true;
    shared.proofreadErr = null;
    shared.pageImageMode = "ok";
    shared.kaspiAvailable = true;
    shared.oembedOk = true;
  });

  it("паритет: книги, вопросы, главы, письма (оба префикса /api и /api/v1/site, 200/400/401/403/405)", async () => {
    await assertRoute({ nest: app, method: "PUT", url: `/api/books/${BOOK_ID}/questions/order`, headers: asOwner, body: { sections: [{ id: Q1_ID, chapter: CH1_ID }] } });
    await assertRoute({ nest: app, method: "POST", url: `/api/books/${BOOK_ID}/questions/${Q1_ID}/move`, headers: asOwner, body: { chapter: "family" } });
    await assertRoute({ nest: app, method: "PATCH", url: `/api/books/${BOOK_ID}/questions/${Q1_ID}`, headers: asOwner, body: { answer: "Ответ" } });
    await assertRoute({ nest: app, method: "PATCH", url: `/api/v1/site/books/${BOOK_ID}/questions/${Q1_ID}`, headers: asOwner, body: { answer: "Ответ" } });
    await assertRoute({ nest: app, method: "DELETE", url: `/api/books/${BOOK_ID}/questions/${Q1_ID}`, headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: `/api/books/${BOOK_ID}/questions/${Q1_ID}`, headers: asOwner });
    await assertRoute({ nest: app, method: "POST", url: `/api/books/${BOOK_ID}/questions`, headers: asOwner, body: { afterId: Q1_ID, prompt: "Вопрос 2?" } });

    await assertRoute({ nest: app, method: "PUT", url: `/api/books/${BOOK_ID}/chapters/order`, headers: asOwner, body: { keys: [CH1_ID] } });
    await assertRoute({ nest: app, method: "PUT", url: `/api/books/${BOOK_ID}/chapters/move`, headers: asOwner, body: { key: "meeting" } });
    await assertRoute({ nest: app, method: "PATCH", url: `/api/books/${BOOK_ID}/chapters/${CH1_ID}`, headers: asOwner, body: { title: "Глава" } });
    await assertRoute({ nest: app, method: "DELETE", url: `/api/books/${BOOK_ID}/chapters/${CH1_ID}`, headers: asOwner });
    await assertRoute({ nest: app, method: "POST", url: `/api/books/${BOOK_ID}/chapters`, headers: asOwner, body: { title: "Новая" } });

    await assertRoute({ nest: app, method: "POST", url: `/api/books/${BOOK_ID}/letters/invite`, headers: asOwner, body: { enabled: true } });
    await assertRoute({ nest: app, method: "PUT", url: `/api/books/${BOOK_ID}/letters/order`, headers: asOwner, body: { ids: [L1_ID] } });
    await assertRoute({ nest: app, method: "PATCH", url: `/api/books/${BOOK_ID}/letters/${L1_ID}`, headers: asOwner, body: { status: "approved" } });
    await assertRoute({ nest: app, method: "DELETE", url: `/api/books/${BOOK_ID}/letters/${L1_ID}`, headers: asOwner });

    await assertRoute({ nest: app, method: "PATCH", url: `/api/books/${BOOK_ID}`, headers: asOwner, body: { title: "Новое" } });
    await assertRoute({ nest: app, method: "PATCH", url: `/api/books/${BOOK_ID}`, headers: originBad, body: { title: "Новое" } });
    await assertRoute({ nest: app, method: "PATCH", url: `/api/books/${BOOK_ID}`, headers: asStranger, body: { title: "Новое" } });
    await assertRoute({ nest: app, method: "DELETE", url: `/api/v1/site/books/${BOOK_ID}`, headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: `/api/books/${BOOK_ID}`, headers: asOwner });
  });

  it("паритет: фото (order, batch, edit multipart, rotate, item, upload multipart), layout и QR-файлы (octet-stream, 413, packs)", async () => {
    await assertRoute({ nest: app, method: "PUT", url: `/api/books/${BOOK_ID}/photos/order`, headers: asOwner, body: { ids: [P1_ID] } });
    await assertRoute({ nest: app, method: "POST", url: `/api/books/${BOOK_ID}/photos/batch`, headers: asOwner, body: { updates: [{ id: P1_ID, patch: { caption: "x" } }] } });
    await assertRoute({ nest: app, method: "GET", url: `/api/books/${BOOK_ID}/photos/${P1_ID}/edit`, headers: asOwner });
    await assertRoute({ nest: app, method: "DELETE", url: `/api/books/${BOOK_ID}/photos/${P1_ID}/edit`, headers: asOwner });
    await assertRoute({ nest: app, method: "POST", url: `/api/books/${BOOK_ID}/photos/${P1_ID}/rotate`, headers: asOwner });
    await assertRoute({ nest: app, method: "PATCH", url: `/api/books/${BOOK_ID}/photos/${P1_ID}`, headers: asOwner, body: { caption: "y" } });
    await assertRoute({ nest: app, method: "DELETE", url: `/api/books/${BOOK_ID}/photos/${P1_ID}`, headers: asOwner });
    await assertRoute({ nest: app, method: "POST", url: `/api/books/${BOOK_ID}/layout`, headers: asOwner });

    const boundary = "----mb-parity-photo";
    const mpUpload = `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\nIMG\r\n--${boundary}--\r\n`;
    await assertRoute({
      nest: app,
      method: "POST",
      url: `/api/books/${BOOK_ID}/photos`,
      headers: { ...asOwner, [LOCALE_HEADER]: "kk", "content-type": `multipart/form-data; boundary=${boundary}` },
      body: mpUpload,
    });

    const mpEdit = [
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="e.jpg"\r\nContent-Type: image/jpeg\r\n\r\nJPG\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="edit"\r\n\r\n{"v":1}\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="version"\r\n\r\nv1\r\n`,
      `--${boundary}--\r\n`,
    ].join("");
    await assertRoute({
      nest: app,
      method: "POST",
      url: `/api/books/${BOOK_ID}/photos/${P1_ID}/edit`,
      headers: { ...asOwner, "content-type": `multipart/form-data; boundary=${boundary}` },
      body: mpEdit,
    });

    await assertRoute({ nest: app, method: "GET", url: `/api/books/${BOOK_ID}/files`, headers: asOwner });
    await assertRoute({ nest: app, method: "POST", url: `/api/books/${BOOK_ID}/files`, headers: asOwner, body: { name: "clip.mp4", size: 1024, type: "video/mp4" } });
    await assertRoute({ nest: app, method: "GET", url: `/api/books/${BOOK_ID}/files/${FILE1_ID}`, headers: asOwner });
    await assertRoute({
      nest: app,
      method: "PUT",
      url: `/api/books/${BOOK_ID}/files/${FILE1_ID}?offset=0`,
      headers: { ...asOwner, "content-type": "application/octet-stream" },
      body: Buffer.from([10, 20, 30, 40]),
    });
    await assertRoute({
      nest: app,
      method: "PUT",
      url: `/api/books/${BOOK_ID}/files/${FILE1_ID}?offset=0`,
      headers: { ...asOwner, "content-type": "application/octet-stream", "content-length": String(FILE_CHUNK_BYTES + 1) },
      body: Buffer.from("x"),
    });
    await assertRoute({ nest: app, method: "POST", url: `/api/books/${BOOK_ID}/files/${FILE1_ID}`, headers: asOwner });
    await assertRoute({ nest: app, method: "DELETE", url: `/api/books/${BOOK_ID}/files/${FILE1_ID}`, headers: asOwner });

    const validMediaPack = getMediaPacks().find((p) => !p.hidden && p.price > 0);
    if (validMediaPack) {
      await assertRoute({ nest: app, method: "POST", url: `/api/books/${BOOK_ID}/files/packs`, headers: asOwner, body: { packId: validMediaPack.id } });
    }
    await assertRoute({ nest: app, method: "POST", url: `/api/books/${BOOK_ID}/files/packs`, headers: asOwner, body: { packId: "nope" } });
  });

  it("паритет: экспорт, превью, растр полос, развороты, обложки, сборка и ИИ-помощники", async () => {
    const exp = await assertRoute({ nest: app, method: "GET", url: `/api/books/${BOOK_ID}/export`, headers: asOwner });

    const pdf = await assertRoute({ nest: app, method: "GET", url: `/api/books/${BOOK_ID}/preview`, headers: asOwner });

    await assertRoute({ nest: app, method: "GET", url: `/api/books/${BOOK_ID}/pages/${BUILD_FP}/1?w=1200`, headers: asOwner });
    shared.pageImageMode = "rasterizer";
    await assertRoute({ nest: app, method: "GET", url: `/api/books/${BOOK_ID}/pages/${BUILD_FP}/1?w=1200`, headers: asOwner });
    shared.pageImageMode = "missing";
    await assertRoute({ nest: app, method: "GET", url: `/api/books/${BOOK_ID}/pages/${BUILD_FP}/1?w=1200`, headers: asOwner });

    await assertRoute({ nest: app, method: "GET", url: `/api/books/${BOOK_ID}/pages-image?kind=chapter&w=600`, headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: `/api/books/${BOOK_ID}/cover-image?w=480&side=back`, headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: `/api/books/${BOOK_ID}/cover-thumb/linen`, headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: `/api/books/${BOOK_ID}/build?retry=1`, headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: `/api/books/${BOOK_ID}/build-progress`, headers: asOwner });

    await assertRoute({ nest: app, method: "GET", url: `/api/books/${BOOK_ID}/help`, headers: asOwner });
    await assertRoute({ nest: app, method: "POST", url: `/api/books/${BOOK_ID}/help`, headers: { ...asOwner, [LOCALE_HEADER]: "kk" }, body: { text: "Помощь" } });
    await assertRoute({ nest: app, method: "GET", url: `/api/books/${BOOK_ID}/design-ai`, headers: asOwner });
    await assertRoute({
      nest: app,
      method: "POST",
      url: `/api/books/${BOOK_ID}/design-ai`,
      headers: asOwner,
      body: { target: "pages", mode: "edit", prompt: "Светлее", state: { interior: "classic", style: {} } },
    });
    await assertRoute({ nest: app, method: "POST", url: `/api/books/${BOOK_ID}/proofread/ai`, headers: asOwner, body: { text: "Привет" } });
    shared.proofreadErr = new AssistantError("unavailable", "down");
    await assertRoute({ nest: app, method: "POST", url: `/api/books/${BOOK_ID}/proofread/ai`, headers: asOwner, body: { text: "Привет" } });
    shared.proofreadErr = null;
    await assertRoute({ nest: app, method: "POST", url: `/api/books/${BOOK_ID}/proofread/spell`, headers: asOwner, body: { words: ["приввет"] } });
    await assertRoute({ nest: app, method: "POST", url: `/api/books/${BOOK_ID}/write/ai`, headers: asOwner, body: { text: "Текст", mode: "improve" } });
  });

  it("паритет: 7 медиа/ресурсных маршрутов (/v, /design-ai/packs, /media/oembed, /fonts, /photos, /covers, /cover-photos)", async () => {
    const v1 = await assertRoute({ nest: app, method: "GET", url: `/api/v/${FILE_TOKEN}`, headers: { range: "bytes=0-3" } });
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/site/v/${FILE_TOKEN}?download=1` });
    await assertRoute({ nest: app, method: "GET", url: `/api/v/${FILE_TOKEN}?poster=1` });
    await assertRoute({ nest: app, method: "GET", url: "/api/v/bad" });

    const aiPack = getAiPacks().find((p) => !p.hidden);
    if (aiPack) {
      await assertRoute({ nest: app, method: "POST", url: "/api/design-ai/packs", headers: asOwner, body: { packId: aiPack.id } });
    }
    await assertRoute({ nest: app, method: "POST", url: "/api/design-ai/packs", headers: asOwner, body: { packId: "nope" } });

    await assertRoute({ nest: app, method: "GET", url: "/api/media/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ", headers: asOwner });
    shared.oembedOk = false;
    await assertRoute({ nest: app, method: "GET", url: "/api/media/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ", headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: "/api/media/oembed?url=https%3A%2F%2Fexample.com", headers: asOwner });

    await assertRoute({ nest: app, method: "GET", url: `/api/fonts/${SAMPLE_FONT}` });
    await assertRoute({ nest: app, method: "GET", url: "/api/fonts/nope.ttf" });

    await assertRoute({ nest: app, method: "GET", url: `/api/photos/${P1_ID}`, headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/site/photos/${P1_ID}?size=view`, headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: `/api/photos/${P1_ID}`, headers: asStranger });

    const covBr = await assertRoute({ nest: app, method: "GET", url: "/api/covers/linen-a5.svg", headers: { "accept-encoding": "br" } });
    await assertRoute({ nest: app, method: "GET", url: "/api/covers/missing.svg" });

    await assertRoute({ nest: app, method: "GET", url: "/api/cover-photos/bg1?w=500" });
    await assertRoute({ nest: app, method: "GET", url: "/api/cover-photos/broken" });
    await assertRoute({ nest: app, method: "DELETE", url: "/api/cover-photos/bg1" });
  });
});
