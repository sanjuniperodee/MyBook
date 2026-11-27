import type { ApiFetch } from "./api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ANSWER_MEDIA_LIMITS } from "@mybook/contracts/limits";
import { FILE_CHUNK_BYTES, MAX_FILES_PER_BOOK, MAX_SECONDS, MAX_SOURCE_BYTES } from "@/lib/book/answer-files";
import { MAX_MEDIA, MEDIA_TITLE_MAX, MEDIA_URL_MAX } from "@/lib/book/answer-media";
import { messagesFor } from "@/i18n/messages";

const BOOK_ID = "3f2b8c1e-7a4d-4e5f-9b6c-1d2e3f4a5b6c";
const QUESTION_ID = "8a7b6c5d-4e3f-4a1b-8c9d-0e1f2a3b4c5d";
const FILE_ID = "11111111-1111-4111-8111-111111111111";
const FILE_ID_2 = "22222222-2222-4222-8222-222222222222";
const PURCHASE_ID = "33333333-3333-4333-8333-333333333333";
const INVOICE_ID = "44444444-4444-4444-8444-444444444444";
const USER_ID = "55555555-5555-4555-8555-555555555555";

const mocks = vi.hoisted(() => ({
  apiBook: vi.fn(),
  rateLimit: vi.fn(),
  ensureCatalog: vi.fn(),
  getMediaPack: vi.fn(),
  bookFileQuota: vi.fn(),
  listBookFiles: vi.fn(),
  findBookFile: vi.fn(),
  startUpload: vi.fn(),
  appendChunk: vi.fn(),
  finishUpload: vi.fn(),
  removeFile: vi.fn(),
  mediaPackOffers: vi.fn(),
  createMediaPurchase: vi.fn(),
  findMediaPurchase: vi.fn(),
  kickAnswerFiles: vi.fn(),
  questions: vi.fn(),
  editQuestion: vi.fn(),
  kaspiAvailable: vi.fn(),
  kaspiPayMediaPack: vi.fn(),
  kaspiStatus: vi.fn(),
  kaspiPaymentProps: vi.fn(),
  invoiceView: vi.fn(),
}));

vi.mock("@/i18n/server", async (orig) => ({
  ...(await orig<object>()),
  getMessages: async () => messagesFor("ru"),
  getLocale: async () => "ru",
}));

vi.mock("@/server/api", async (orig) => {
  const actual = await orig<typeof import("@/server/api")>();
  return { ...actual, apiBook: mocks.apiBook };
});

vi.mock("@/server/rateLimit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/server/catalog", () => ({ ensureCatalog: mocks.ensureCatalog, syncCatalogFromSettings: mocks.ensureCatalog }));
vi.mock("@/config/site", async (orig) => {
  const actual = await orig<typeof import("@/config/site")>();
  return { ...actual, getMediaPack: mocks.getMediaPack };
});

vi.mock("@/server/answerFiles", async (orig) => {
  const actual = await orig<typeof import("@/server/answerFiles")>();
  return {
    ...actual,
    bookFileQuota: mocks.bookFileQuota,
    listBookFiles: mocks.listBookFiles,
    findBookFile: mocks.findBookFile,
    startUpload: mocks.startUpload,
    appendChunk: mocks.appendChunk,
    finishUpload: mocks.finishUpload,
    removeFile: mocks.removeFile,
    mediaPackOffers: mocks.mediaPackOffers,
    createMediaPurchase: mocks.createMediaPurchase,
    findMediaPurchase: mocks.findMediaPurchase,
  };
});

vi.mock("@/server/answerFilesWorker", () => ({ kickAnswerFiles: mocks.kickAnswerFiles }));

vi.mock("@/server/container", () => ({
  container: () => ({
    authoring: {
      // Книга для BookAccessGuard бэкенда — та же, что отдаёт подменённый apiBook (недоступна — null, как чужая).
      queries: {
        questions: mocks.questions,
        visibleBook: async (bookId: string) => {
          try {
            return ((await mocks.apiBook(null, bookId, {})) as { book: unknown }).book;
          } catch {
            return null;
          }
        },
      },
      questions: { edit: mocks.editQuestion },
    },
    // Лимит частоты бэкенда (RATE_LIMITER) — тот же подменённый rateLimit.
    rateLimiter: { hit: (key: string) => mocks.rateLimit(key), peek: async () => null, reset: async () => {} },
    ordering: {
      kaspi: {
        available: mocks.kaspiAvailable,
        payMediaPack: mocks.kaspiPayMediaPack,
        status: mocks.kaspiStatus,
      },
    },
  }),
}));

vi.mock("@/server/kaspi-view", () => ({
  kaspiPaymentProps: mocks.kaspiPaymentProps,
  invoiceView: mocks.invoiceView,
}));

const { nestApi, legacyAuth } = await import("./api");
const { HttpError } = await import("@/server/api");

const makeUser = (locale: "ru" | "kk" = "ru") =>
  ({ id: USER_ID, name: "Анна", email: "a@x.kz", phone: "+77011234567", locale, role: "user", staffDisabled: false }) as never;

const makeBook = (status: "draft" | "ordered" = "draft") => ({
  id: BOOK_ID,
  userId: USER_ID,
  status,
  title: "Моя книга",
  language: "ru",
});

const makeFileRow = (over: Record<string, unknown> = {}) => ({
  id: FILE_ID,
  token: "Ab3dE9xK2m",
  bookId: BOOK_ID,
  userId: USER_ID,
  kind: "video" as const,
  status: "ready" as const,
  name: "clip.mp4",
  sourceMime: "video/mp4",
  sourceBytes: 1024,
  receivedBytes: 1024,
  declaredSec: 65,
  durationSec: 65,
  width: 1280,
  height: 720,
  bytes: 512,
  hasPoster: true,
  error: null,
  readyAt: new Date("2026-11-25T10:00:00.000Z"),
  createdAt: new Date("2026-11-25T09:55:00.000Z"),
  updatedAt: new Date("2026-11-25T10:00:00.000Z"),
  ...over,
});

function appFor(locale: "ru" | "kk" = "ru") {
  const u = makeUser(locale);
  return nestApi({
    auth: legacyAuth({
      user: async () => u,
      staff: async () => {
        throw new HttpError(403, "forbidden");
      },
    }),
  });
}

const callJson = (app: ApiFetch, method: string, urlPath: string, body?: unknown) =>
  app(
    new Request(`http://127.0.0.1:3044${urlPath}`, {
      method,
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rateLimit.mockResolvedValue(true);
  mocks.ensureCatalog.mockResolvedValue(undefined);
  mocks.apiBook.mockImplementation(async (_req: Request, _bookId: string, opts?: { editable?: boolean }) => {
    const book = makeBook("draft");
    if (opts?.editable && book.status !== "draft") throw new HttpError(409, "bookLocked");
    return { user: makeUser("ru"), book, viewer: { userId: USER_ID, canEditAll: false, onlyOwn: false } };
  });
  mocks.bookFileQuota.mockResolvedValue({ minutes: 30, usedSec: 300, leftSec: 1500, files: 1, maxFiles: MAX_FILES_PER_BOOK });
  mocks.listBookFiles.mockResolvedValue([makeFileRow()]);
  mocks.mediaPackOffers.mockResolvedValue([{ id: "m60", minutes: 60, price: 3900, featured: true }]);
  mocks.kaspiAvailable.mockResolvedValue(true);
  mocks.questions.mockResolvedValue([
    {
      id: QUESTION_ID,
      bookId: BOOK_ID,
      answer: "Первый абзац истории.\n\nВторой абзац истории.",
      media: [
        { id: "m1", kind: "video", url: "https://mybooks.kz/v/Ab3dE9xK2m", fileId: FILE_ID, title: "Пожелание", anchor: null },
        { id: "m2", kind: "audio", url: "https://mybooks.kz/v/Zz00000000", fileId: FILE_ID_2, title: "Удалённый", anchor: 0 },
      ],
    },
  ]);
  mocks.editQuestion.mockResolvedValue(undefined);
});

describe("лимиты и архитектура", () => {
  it("ANSWER_MEDIA_LIMITS из лёгкого @mybook/contracts/limits совпадают с лимитами сайта", () => {
    expect(ANSWER_MEDIA_LIMITS).toEqual({
      maxMedia: MAX_MEDIA,
      titleMax: MEDIA_TITLE_MAX,
      urlMax: MEDIA_URL_MAX,
      chunkBytes: FILE_CHUNK_BYTES,
      maxSourceBytes: MAX_SOURCE_BYTES,
      maxVideoSec: MAX_SECONDS.video,
      maxAudioSec: MAX_SECONDS.audio,
      maxFilesPerBook: MAX_FILES_PER_BOOK,
    });
  });
});

describe("API v1 answer-files: состояние, локализация и QR", () => {
  it("answerMediaGet возвращает QR SVG, статусы файлов (ready/gone), квоту, пакеты, позиции и локализованные подписи (ru и kk)", async () => {
    const resRu = await callJson(await appFor("ru"), "GET", `/api/v1/books/${BOOK_ID}/questions/${QUESTION_ID}/media`);
    expect(resRu.status).toBe(200);
    const ru = await resRu.json();
    expect(ru.editable).toBe(true);
    expect(ru.media).toHaveLength(2);
    expect(ru.media[0]).toMatchObject({
      id: "m1",
      kind: "video",
      fileId: FILE_ID,
      source: "MyBooks",
      playbackUrl: "/api/v/Ab3dE9xK2m",
    });
    expect(ru.media[0].qrSvg).toContain("<svg");
    expect(ru.media[0].qrSvg).toContain("<path");
    expect(ru.media[0].file.statusLabel).toBe(messagesFor("ru").editor.media.file.ready("1:05"));
    expect(ru.media[1].file.status).toBe("gone");
    expect(ru.media[1].file.errorText).toContain(messagesFor("ru").editor.media.file.errors.gone);
    expect(ru.quota.statusText).toBe(messagesFor("ru").editor.media.upload.left("25", 30));
    expect(ru.packs).toHaveLength(1);
    expect(ru.packs[0].minutesLabel).toBe(messagesFor("ru").editor.media.upload.packMinutes(60));
    expect(ru.positions.map((p: { anchor: number | null }) => p.anchor)).toEqual([-1, 0, null]);
    expect(ru.labels.title).toBe(messagesFor("ru").editor.media.title);

    const resKk = await callJson(await appFor("kk"), "GET", `/api/v1/books/${BOOK_ID}/questions/${QUESTION_ID}/media`);
    expect(resKk.status).toBe(200);
    const kk = await resKk.json();
    expect(kk.labels.title).toBe(messagesFor("kk").editor.media.title);
    expect(kk.quota.statusText).toBe(messagesFor("kk").editor.media.upload.left("25", 30));
    expect(kk.labels.upload.button).toBe(messagesFor("kk").editor.media.upload.button);
  });

  it("скрывает пакеты минут, если Kaspi недоступен, и помечает заказанную книгу нередактируемой", async () => {
    mocks.kaspiAvailable.mockResolvedValue(false);
    mocks.apiBook.mockResolvedValue({ user: makeUser("ru"), book: makeBook("ordered"), viewer: { userId: USER_ID, canEditAll: false, onlyOwn: false } });
    const res = await callJson(await appFor("ru"), "GET", `/api/v1/books/${BOOK_ID}/questions/${QUESTION_ID}/media`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.editable).toBe(false);
    expect(body.packs).toEqual([]);
  });
});

describe("API v1 answer-files: загрузка файла, ссылки и удаление", () => {
  it("полный цикл загрузки: start → chunk → finish (запускает воркер) → status → delete", async () => {
    const uploading = makeFileRow({ status: "uploading", receivedBytes: 0, sourceBytes: 12, durationSec: null, hasPoster: false });
    const queued = makeFileRow({ status: "queued", receivedBytes: 12, sourceBytes: 12, durationSec: null, hasPoster: false });
    mocks.startUpload.mockResolvedValue(uploading);
    mocks.findBookFile.mockResolvedValue(uploading);
    mocks.appendChunk.mockResolvedValue(12);
    mocks.finishUpload.mockResolvedValue(queued);
    mocks.removeFile.mockResolvedValue(undefined);

    const app = await appFor("ru");
    const started = await callJson(app, "POST", `/api/v1/books/${BOOK_ID}/files`, { name: "voice.m4a", size: 12, type: "audio/mp4", durationSec: 5 });
    expect(started.status).toBe(200);
    expect(await started.json()).toMatchObject({ chunkBytes: FILE_CHUNK_BYTES, file: { id: FILE_ID, status: "uploading" } });

    const form = new FormData();
    form.append("chunk", new File([new Uint8Array(12)], "voice.m4a", { type: "application/octet-stream" }));
    const chunkRes = await app(new Request(`http://127.0.0.1:3044/api/v1/books/${BOOK_ID}/files/${FILE_ID}/chunk?offset=0`, { method: "PUT", body: form }));
    expect(chunkRes.status).toBe(200);
    expect(await chunkRes.json()).toEqual({ received: 12 });
    expect(mocks.appendChunk).toHaveBeenCalledWith(uploading, 0, expect.any(Buffer));

    const finishRes = await callJson(app, "POST", `/api/v1/books/${BOOK_ID}/files/${FILE_ID}/finish`);
    expect(finishRes.status).toBe(200);
    expect((await finishRes.json()).file.status).toBe("queued");
    expect(mocks.kickAnswerFiles).toHaveBeenCalledTimes(1);

    mocks.findBookFile.mockResolvedValue(makeFileRow({ status: "processing", durationSec: null, hasPoster: false }));
    const statusRes = await callJson(app, "GET", `/api/v1/books/${BOOK_ID}/files/${FILE_ID}`);
    expect(statusRes.status).toBe(200);
    expect((await statusRes.json()).file.statusLabel).toBe(messagesFor("ru").editor.media.file.processing);

    const delRes = await callJson(app, "DELETE", `/api/v1/books/${BOOK_ID}/files/${FILE_ID}`);
    expect(delRes.status).toBe(200);
    expect(await delRes.json()).toEqual({ ok: true });
    expect(mocks.removeFile).toHaveBeenCalledTimes(1);
  });

  it("запрещает загрузку и правку заказанной книги (409 bookLocked) и ограничивает частоту (429 fileRate)", async () => {
    mocks.apiBook.mockImplementation(async (_req: Request, _id: string, opts?: { editable?: boolean }) => {
      if (opts?.editable) throw new HttpError(409, "bookLocked");
      return { user: makeUser("ru"), book: makeBook("ordered"), viewer: { userId: USER_ID, canEditAll: false, onlyOwn: false } };
    });
    const app = await appFor("ru");
    const locked = await callJson(app, "POST", `/api/v1/books/${BOOK_ID}/files`, { name: "a.mp4", size: 100, type: "video/mp4", durationSec: 10 });
    expect(locked.status).toBe(409);
    expect(await locked.json()).toMatchObject({ code: "bookLocked" });

    mocks.apiBook.mockResolvedValue({ user: makeUser("ru"), book: makeBook("draft"), viewer: { userId: USER_ID, canEditAll: false, onlyOwn: false } });
    mocks.rateLimit.mockResolvedValue(false);
    const rate = await callJson(app, "POST", `/api/v1/books/${BOOK_ID}/files`, { name: "a.mp4", size: 100, type: "video/mp4", durationSec: 10 });
    expect(rate.status).toBe(429);
    expect(await rate.json()).toMatchObject({ code: "fileRate" });
  });

  it("answerMediaAddLink разбирает ссылку, отсекает мусор и дубликаты, определяет Spotify как music", async () => {
    const app = await appFor("ru");
    const bad = await callJson(app, "POST", `/api/v1/books/${BOOK_ID}/questions/${QUESTION_ID}/media/link`, { url: "not-a-link" });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ code: "badUrl", error: messagesFor("ru").editor.media.badUrl });

    const ok = await callJson(app, "POST", `/api/v1/books/${BOOK_ID}/questions/${QUESTION_ID}/media/link`, { url: "https://open.spotify.com/track/123" });
    expect(ok.status).toBe(200);
    expect(mocks.editQuestion).toHaveBeenCalledWith(
      BOOK_ID,
      expect.anything(),
      QUESTION_ID,
      expect.objectContaining({
        media: expect.arrayContaining([expect.objectContaining({ kind: "music", url: "https://open.spotify.com/track/123" })]),
      }),
    );

    // Дубликат уже прикреплённой ссылки — 400 duplicate.
    const dup = await callJson(app, "POST", `/api/v1/books/${BOOK_ID}/questions/${QUESTION_ID}/media/link`, { url: "https://mybooks.kz/v/Ab3dE9xK2m" });
    expect(dup.status).toBe(400);
    expect(await dup.json()).toMatchObject({ code: "duplicate" });
  });
});

describe("API v1 answer-files: покупка пакета минут через Kaspi", () => {
  it("создаёт покупку пакета, выставляет счёт Kaspi и возвращает обновлённую квоту при опросе", async () => {
    mocks.getMediaPack.mockReturnValue({ id: "m60", minutes: 60, price: 3900, featured: true, hidden: false });
    mocks.createMediaPurchase.mockResolvedValue({ id: PURCHASE_ID, number: 7, userId: USER_ID, bookId: BOOK_ID, packId: "m60", minutes: 60, amount: 3900, status: "pending_payment" });
    mocks.findMediaPurchase.mockResolvedValue({ id: PURCHASE_ID, number: 7, userId: USER_ID, bookId: BOOK_ID, packId: "m60", minutes: 60, amount: 3900, status: "pending_payment" });
    mocks.kaspiPaymentProps.mockResolvedValue({ initial: null, defaultPhone: "+77011234567" });
    const invView = { id: INVOICE_ID, method: "qr", status: "pending", amount: 3900, phone: null, link: "https://kaspi.kz/pay/1", qrSvg: "<svg/>", expiresAt: null, paidAt: null };
    mocks.kaspiPayMediaPack.mockResolvedValue({ id: INVOICE_ID });
    mocks.kaspiStatus.mockResolvedValue({ id: INVOICE_ID });
    mocks.invoiceView.mockResolvedValue(invView);

    const app = await appFor("ru");
    const buyRes = await callJson(app, "POST", `/api/v1/books/${BOOK_ID}/files/packs`, { packId: "m60" });
    expect(buyRes.status).toBe(200);
    const buy = await buyRes.json();
    expect(buy.purchase).toMatchObject({
      id: PURCHASE_ID,
      number: 7,
      minutes: 60,
      amount: 3900,
      title: messagesFor("ru").editor.media.upload.payTitle(60),
      note: messagesFor("ru").editor.media.upload.payNote(7),
      paidToast: messagesFor("ru").editor.media.upload.paid(60),
    });
    expect(buy.kaspi).toMatchObject({ defaultPhone: "+77011234567", current: null });

    const payRes = await callJson(app, "POST", `/api/v1/books/${BOOK_ID}/files/packs/${PURCHASE_ID}/kaspi`, { method: "qr", phone: "" });
    expect(payRes.status).toBe(200);
    expect((await payRes.json()).invoice).toMatchObject({ id: INVOICE_ID, method: "qr", qrSvg: "<svg/>" });

    mocks.invoiceView.mockResolvedValue({ ...invView, status: "paid", qrSvg: null });
    mocks.bookFileQuota.mockResolvedValue({ minutes: 90, usedSec: 300, leftSec: 5100, files: 1, maxFiles: MAX_FILES_PER_BOOK });
    const statusRes = await callJson(app, "GET", `/api/v1/books/${BOOK_ID}/files/packs/${PURCHASE_ID}/kaspi/${INVOICE_ID}`);
    expect(statusRes.status).toBe(200);
    const status = await statusRes.json();
    expect(status.invoice.status).toBe("paid");
    expect(status.quota.minutes).toBe(90);
  });

  it("возвращает 404 для скрытого пакета и чужой покупки", async () => {
    mocks.getMediaPack.mockReturnValue({ id: "m60", minutes: 60, price: 3900, featured: false, hidden: true });
    const app = await appFor("ru");
    expect((await callJson(app, "POST", `/api/v1/books/${BOOK_ID}/files/packs`, { packId: "m60" })).status).toBe(404);

    mocks.findMediaPurchase.mockResolvedValue({ id: PURCHASE_ID, number: 7, userId: "99999999-9999-4999-8999-999999999999", bookId: BOOK_ID, packId: "m60", minutes: 60, amount: 3900, status: "pending_payment" });
    expect((await callJson(app, "POST", `/api/v1/books/${BOOK_ID}/files/packs/${PURCHASE_ID}/kaspi`, { method: "qr", phone: "" })).status).toBe(404);
  });
});
