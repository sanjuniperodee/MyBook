import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { InjectOptions } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { v1 } from "@mybook/contracts";
import { site } from "@/config/site";
import { LOCALE_HEADER } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { StaffContext } from "@/modules/access/domain/StaffContext";
import { AuthoringError } from "@/modules/authoring/domain";
import { FeedbackError, reviewUrl } from "@/modules/feedback";
import { isPhoneEmail } from "@/modules/identity";
import { OrderingError } from "@/modules/ordering/domain";
import { STAFF_ACCESS, type StaffAccessPort } from "../src/core/auth/staff";
import { PUBLIC_PORTS, type PublicPorts } from "../src/modules/public/public.tokens";
import { bootTestApp, sessionOf, testUser, type FakeLimiter } from "./app";

const OWNER = testUser("11111111-1111-4111-8111-111111111111", { name: "Айгерим" });
const STRANGER = testUser("22222222-2222-4222-8222-222222222222", { name: "Дина" });
const REVIEW_STAFF = testUser("33333333-3333-4333-8333-333333333333", { name: "Модератор", role: "admin" });
const LIMITED_STAFF = testUser("44444444-4444-4444-8444-444444444444", { name: "Менеджер", role: "admin" });
const GATED_STAFF = testUser("55555555-5555-4555-8555-555555555555", { name: "Без2ФА", role: "admin" });

const ORDER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REVIEW_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const GIFT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const GIFT_TOKEN = "Gift_token_abcdefghijklmn";
const INVITE_TOKEN = "invite_token_1234";
const FILE_TOKEN_OK = "AbCdEf1234";
const VISITOR_TOKEN = "visitor_token_1234567890abcd";
const PUBLISHED_AT = new Date("2026-11-20T10:00:00.000Z");

const asOwner = { cookie: `mb_session=${sessionOf(OWNER)}` };
const asStranger = { cookie: `mb_session=${sessionOf(STRANGER)}` };
const asReviewStaff = { cookie: `mb_session=${sessionOf(REVIEW_STAFF)}` };
const asLimitedStaff = { cookie: `mb_session=${sessionOf(LIMITED_STAFF)}` };
const asGatedStaff = { cookie: `mb_session=${sessionOf(GATED_STAFF)}` };
const originOk = { origin: "http://localhost:3000" };
const originBad = { origin: "https://evil.example" };

const staffAccess: StaffAccessPort = {
  async resolve(user) {
    if (user.id === REVIEW_STAFF.id) {
      return { context: new StaffContext(user.id, "Модератор", "moderator", "all", new Set(["reviews.manage"]), false, { isPhoneEmail }), gate: null };
    }
    if (user.id === LIMITED_STAFF.id) {
      return { context: new StaffContext(user.id, "Менеджер", "sales", "own", new Set(["deals.view"]), false, { isPhoneEmail }), gate: null };
    }
    if (user.id === GATED_STAFF.id) {
      return { context: new StaffContext(user.id, "Без2ФА", "owner", "all", new Set(["reviews.manage"]), true, { isPhoneEmail }), gate: "2fa" };
    }
    return null;
  },
};

function createPortsMock() {
  return {
    readCatalogSettings: vi.fn<PublicPorts["readCatalogSettings"]>(),
    ensureCatalog: vi.fn<PublicPorts["ensureCatalog"]>(),
    widgetConfig: vi.fn<PublicPorts["widgetConfig"]>(),
    shopWhatsapp: vi.fn<PublicPorts["shopWhatsapp"]>(),
    reviewsShowcase: vi.fn<PublicPorts["reviewsShowcase"]>(),
    reviewsSummary: vi.fn<PublicPorts["reviewsSummary"]>(),
    reviewPhoto: vi.fn<PublicPorts["reviewPhoto"]>(),
    reviewPhotoFile: vi.fn<PublicPorts["reviewPhotoFile"]>(),
    orderDetails: vi.fn<PublicPorts["orderDetails"]>(),
    isOrderOwner: vi.fn<PublicPorts["isOrderOwner"]>(),
    openReview: vi.fn<PublicPorts["openReview"]>(),
    submitReview: vi.fn<PublicPorts["submitReview"]>(),
    inviteWelcome: vi.fn<PublicPorts["inviteWelcome"]>(),
    followShortLink: vi.fn<PublicPorts["followShortLink"]>(),
    giftByToken: vi.fn<PublicPorts["giftByToken"]>(),
    giftPaymentProps: vi.fn<PublicPorts["giftPaymentProps"]>(),
    redeemUrl: vi.fn<PublicPorts["redeemUrl"]>(),
    purchaseGift: vi.fn<PublicPorts["purchaseGift"]>(),
    claimGiftPayment: vi.fn<PublicPorts["claimGiftPayment"]>(),
    checkPromo: vi.fn<PublicPorts["checkPromo"]>(),
    giftByPromo: vi.fn<PublicPorts["giftByPromo"]>(),
    giftPdf: vi.fn<PublicPorts["giftPdf"]>(),
    bookByInviteToken: vi.fn<PublicPorts["bookByInviteToken"]>(),
    submitLetter: vi.fn<PublicPorts["submitLetter"]>(),
    isValidUnsubscribeLink: vi.fn<PublicPorts["isValidUnsubscribeLink"]>(),
    unsubscribe: vi.fn<PublicPorts["unsubscribe"]>(),
    publicAnswerFile: vi.fn<PublicPorts["publicAnswerFile"]>(),
    siteMessages: vi.fn<PublicPorts["siteMessages"]>(),
    postSiteChat: vi.fn<PublicPorts["postSiteChat"]>(),
    requestCallback: vi.fn<PublicPorts["requestCallback"]>(),
    calendarFeed: vi.fn<PublicPorts["calendarFeed"]>(),
    chatAvatarFile: vi.fn<PublicPorts["chatAvatarFile"]>(),
    recordLandingVisit: vi.fn<PublicPorts["recordLandingVisit"]>(),
  };
}

const ports = createPortsMock();

const giftPaid = {
  id: GIFT_ID,
  number: 17,
  token: GIFT_TOKEN,
  status: "paid" as const,
  plan: "hardcover",
  amount: 29000,
  currency: "KZT",
  locale: "kk",
  buyerName: "Асель",
  buyerEmail: "asel@mybooks.kz",
  buyerPhone: "+77011112233",
  recipientName: "Мама",
  recipientEmail: "mama@mybooks.kz",
  message: "С любовью",
  sendAt: "2026-12-01",
  sentAt: null,
  paymentClaimedAt: PUBLISHED_AT,
  promo: { code: "GIFT-AAAA-BBBB", usedCount: 0, expiresAt: PUBLISHED_AT },
};

const giftCreateBody = {
  plan: "hardcover" as const,
  buyerName: "Асель",
  buyerEmail: "asel@mybooks.kz",
  buyerPhone: "+77011112233",
  recipientName: "Мама",
  recipientEmail: null,
  sendAt: null,
  message: "С праздником!",
  locale: "ru" as const,
  buyerLocale: "kk" as const,
};

function buildMultipart(boundary: string, fields: Record<string, string>, file?: { field: string; name: string; type: string; data: string }) {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`);
  }
  if (file) {
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n${file.data}\r\n`);
  }
  parts.push(`--${boundary}--\r\n`);
  return parts.join("");
}

let app: NestFastifyApplication;
let limiter: FakeLimiter;
const call = (opts: InjectOptions) => app.inject(opts);

beforeAll(async () => {
  ({ app, limiter } = await bootTestApp({
    users: [OWNER, STRANGER, REVIEW_STAFF, LIMITED_STAFF, GATED_STAFF],
    overrides: [
      [PUBLIC_PORTS, ports],
      [STAFF_ACCESS, staffAccess],
    ],
  }));
});

afterAll(() => app.close());

beforeEach(() => {
  vi.clearAllMocks();
  limiter.hits.length = 0;
  limiter.deny = false;

  ports.readCatalogSettings.mockResolvedValue({
    overrides: { hardcover: { price: 31000 } },
    registration: true,
    giftNote: false,
    seller: { legalName: "ИП MyBooks", bin: "123", phone: "+77010000000", whatsapp: "77010000000" },
  });
  ports.ensureCatalog.mockResolvedValue(undefined);
  ports.widgetConfig.mockResolvedValue({ enabled: true, chat: true, whatsapp: "77010000000" });
  ports.shopWhatsapp.mockResolvedValue("77015554433");
  ports.reviewsShowcase.mockResolvedValue([
    { id: REVIEW_ID, rating: 5, text: "Очень трогательно, мама плакала", authorName: "Дина", city: "Астана", theme: "mom", locale: "ru", photo: { width: 800, height: 600 }, publishedAt: PUBLISHED_AT },
  ]);
  ports.reviewsSummary.mockResolvedValue({ count: 12, average: 4.9 });
  ports.reviewPhoto.mockResolvedValue({ key: "reviews/r1.jpg", published: true, userId: OWNER.id });
  ports.reviewPhotoFile.mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
  ports.orderDetails.mockResolvedValue({
    number: 1042,
    book: { theme: "mom", title: "Наша история", coverTemplate: "linen", coverLines: true, format: "a5", authorName: "Алия", recipientName: "Мама", hideRecipientOnCover: false, namesOnCover: "" },
  });
  ports.isOrderOwner.mockImplementation(async (orderId, userId) => orderId === ORDER_ID && userId === OWNER.id);
  ports.openReview.mockResolvedValue({
    order: { name: "Алия" },
    review: {
      snapshot: () => ({ rating: 5, text: "Чудесно", authorName: "Алия", city: "Алматы", consent: true, photo: null, status: "new", thankYouCode: "THX-1" }),
    },
  });
  ports.submitReview.mockResolvedValue({ status: "new", thankYouCode: "THX-1", hasPhoto: true });
  ports.inviteWelcome.mockImplementation(async (code) => (code === "ASEL-7K2Q" ? { code, percent: 10, from: "Асель" } : null));
  ports.followShortLink.mockImplementation(async (slug) => (slug === "insta" ? "https://mybooks.kz/?utm_source=instagram&lnk=insta" : null));
  ports.giftByToken.mockImplementation(async (token) => (token === GIFT_TOKEN ? giftPaid : null));
  ports.giftPaymentProps.mockImplementation(async (_giftId, buyerPhone, m) => ({
    online: null,
    manual: { title: m.common.manualPayment.title, steps: ["Шаг 1"] },
    kaspi: { initial: null, defaultPhone: buyerPhone },
  }));
  ports.redeemUrl.mockImplementation((code, locale) => `http://localhost:3000/${locale}/redeem?code=${code}`);
  ports.purchaseGift.mockResolvedValue({ token: GIFT_TOKEN, amount: 29000 });
  ports.claimGiftPayment.mockImplementation(async (token) => (token === GIFT_TOKEN ? { token } : null));
  ports.checkPromo.mockImplementation(async (code) =>
    code.toUpperCase() === "GIFT-AAAA-BBBB"
      ? { ok: true, promo: { id: "promo-1", code: "GIFT-AAAA-BBBB", kind: "fixed", value: 29000, label: "29 000 ₸" } }
      : { ok: false, error: "notFound" },
  );
  ports.giftByPromo.mockResolvedValue({ locale: "kk", plan: "hardcover", recipientName: "Мама", buyerName: "Асель", message: "С любовью" });
  ports.giftPdf.mockImplementation(async (token) =>
    token === GIFT_TOKEN ? { gift: { status: "paid", locale: "ru", number: 17 }, pdf: new Uint8Array([0x25, 0x50, 0x44, 0x46]) } : null,
  );
  ports.bookByInviteToken.mockImplementation(async (token) =>
    token === INVITE_TOKEN
      ? { status: "draft", theme: "mom", title: "Мамина книга", authorName: "Алия", recipientName: "Мама", inviteText: "Напишите пару слов", coverTemplate: "linen", coverLines: true, format: "a5" }
      : null,
  );
  ports.submitLetter.mockResolvedValue(undefined);
  ports.isValidUnsubscribeLink.mockImplementation((u, t) => u === OWNER.id && t === "valid-sig");
  ports.unsubscribe.mockResolvedValue(undefined);
  ports.publicAnswerFile.mockImplementation(async (token) =>
    token === FILE_TOKEN_OK
      ? { file: { kind: "video", status: "ready", hasPoster: true, width: 1280, height: 720, durationSec: 45 }, bookTitle: "Наша книга", authorName: "Айгерим", caption: "Поздравление" }
      : null,
  );
  ports.siteMessages.mockResolvedValue([{ id: "m1", mine: false, text: "Здравствуйте!", at: PUBLISHED_AT.toISOString() }]);
  ports.postSiteChat.mockResolvedValue(undefined);
  ports.requestCallback.mockResolvedValue(undefined);
  ports.calendarFeed.mockImplementation(async (token) => (token === "cal_token_1234567890abcdef" ? "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n" : null));
  ports.chatAvatarFile.mockImplementation(async (file) => (file === "ok.webp" ? new Uint8Array([0x52, 0x49, 0x46, 0x46]) : null));
  ports.recordLandingVisit.mockResolvedValue(undefined);
});

describe("Контекст 3: 13 контрактных маршрутов (/api/v1/web/*)", () => {
  it("webAnswerFilePage: 200, формат токена, 400, ETag/304 и 405", async () => {
    const ok = await call({ method: "GET", url: `/api/v1/web/answer-files/${FILE_TOKEN_OK}` });
    expect(ok.statusCode).toBe(200);
    expect(v1.webAnswerFilePage.response.parse(ok.json())).toMatchObject({ found: { bookTitle: "Наша книга", file: { kind: "video", hasPoster: true } } });
    const cached = await call({ method: "GET", url: `/api/v1/web/answer-files/${FILE_TOKEN_OK}`, headers: { "if-none-match": String(ok.headers.etag) } });
    expect(cached.statusCode).toBe(304);

    // 12 символов проходят контракт min(10), но отсекаются FILE_TOKEN до похода в БД (2 вызова были на 200 и 304).
    const badFormat = await call({ method: "GET", url: "/api/v1/web/answer-files/123456789012" });
    expect(badFormat.statusCode).toBe(200);
    expect(badFormat.json()).toEqual({ found: null });
    expect(ports.publicAnswerFile).toHaveBeenCalledTimes(2);

    const tooShort = await call({ method: "GET", url: "/api/v1/web/answer-files/short" });
    expect(tooShort.statusCode).toBe(400);

    const wrong = await call({ method: "POST", url: `/api/v1/web/answer-files/${FILE_TOKEN_OK}` });
    expect(wrong.statusCode).toBe(405);
    expect(wrong.headers.allow).toBe("GET");
  });

  it("webSiteCatalog и webSiteChrome: 200, фоллбеки при сбое и 405", async () => {
    const cat = await call({ method: "GET", url: "/api/v1/web/site/catalog" });
    expect(cat.statusCode).toBe(200);
    expect(v1.webSiteCatalog.response.parse(cat.json())).toMatchObject({ registration: true, giftNote: false });

    const chrome = await call({ method: "GET", url: "/api/v1/web/site/chrome" });
    expect(chrome.statusCode).toBe(200);
    expect(chrome.json()).toEqual({ widget: { enabled: true, chat: true, whatsapp: "77010000000" }, shopWhatsappDigits: "77015554433" });

    ports.widgetConfig.mockRejectedValueOnce(new Error("db down"));
    ports.shopWhatsapp.mockRejectedValueOnce(new Error("db down"));
    const fallback = await call({ method: "GET", url: "/api/v1/web/site/chrome" });
    expect(fallback.statusCode).toBe(200);
    expect(fallback.json()).toEqual({ widget: null, shopWhatsappDigits: site.contacts.whatsapp.replace(/\D/g, "") });

    expect((await call({ method: "DELETE", url: "/api/v1/web/site/catalog" })).statusCode).toBe(405);
    expect((await call({ method: "POST", url: "/api/v1/web/site/chrome" })).statusCode).toBe(405);
  });

  it("webReviewsShowcase: 200, порог сводки, фоллбек при сбое, 400 и 405", async () => {
    const ok = await call({ method: "GET", url: "/api/v1/web/reviews/showcase?limit=8&theme=mom" });
    expect(ok.statusCode).toBe(200);
    expect(v1.webReviewsShowcase.response.parse(ok.json()).summary).toEqual({ count: 12, average: 4.9 });
    expect(ports.reviewsShowcase).toHaveBeenCalledWith(8, "mom");

    ports.reviewsSummary.mockResolvedValueOnce({ count: 3, average: 5 });
    const small = await call({ method: "GET", url: "/api/v1/web/reviews/showcase" });
    expect(small.json().summary).toBeNull();

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    ports.reviewsShowcase.mockRejectedValueOnce(new Error("timeout"));
    const failed = await call({ method: "GET", url: "/api/v1/web/reviews/showcase" });
    errSpy.mockRestore();
    expect(failed.statusCode).toBe(200);
    expect(failed.json()).toEqual({ reviews: [], summary: null });

    expect((await call({ method: "GET", url: "/api/v1/web/reviews/showcase?limit=99" })).statusCode).toBe(400);
    expect((await call({ method: "POST", url: "/api/v1/web/reviews/showcase" })).statusCode).toBe(405);
  });

  it("webInviteWelcome: 200, отсечение кривого кода, 400 и 405", async () => {
    const ok = await call({ method: "GET", url: "/api/v1/web/invite/welcome?code=ASEL-7K2Q" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ welcome: { code: "ASEL-7K2Q", percent: 10, from: "Асель" } });

    const invalid = await call({ method: "GET", url: "/api/v1/web/invite/welcome?code=bad%20code!" });
    expect(invalid.statusCode).toBe(200);
    expect(invalid.json()).toEqual({ welcome: null });
    expect(ports.inviteWelcome).toHaveBeenCalledTimes(1);

    expect((await call({ method: "GET", url: "/api/v1/web/invite/welcome" })).statusCode).toBe(400);
    expect((await call({ method: "POST", url: "/api/v1/web/invite/welcome" })).statusCode).toBe(405);
  });

  it("webGiftStatus: оплаченный, ожидающий оплаты с локалью, 404 и 405", async () => {
    const paid = await call({ method: "GET", url: `/api/v1/web/gifts/${GIFT_TOKEN}` });
    expect(paid.statusCode).toBe(200);
    expect(v1.webGiftStatus.response.parse(paid.json())).toMatchObject({
      status: "paid",
      promo: { code: "GIFT-AAAA-BBBB" },
      redeemUrl: "http://localhost:3000/kk/redeem?code=GIFT-AAAA-BBBB",
      payment: null,
    });

    ports.giftByToken.mockResolvedValueOnce({ ...giftPaid, status: "pending_payment", promo: null });
    const pending = await call({ method: "GET", url: `/api/v1/web/gifts/${GIFT_TOKEN}?locale=kk` });
    expect(pending.statusCode).toBe(200);
    expect(pending.json().payment).toMatchObject({
      manual: { title: messagesFor("kk").common.manualPayment.title },
      kaspi: { defaultPhone: "+77011112233" },
    });

    const missing = await call({ method: "GET", url: "/api/v1/web/gifts/unknown_token" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe("invoiceNotFound");

    expect((await call({ method: "DELETE", url: `/api/v1/web/gifts/${GIFT_TOKEN}` })).statusCode).toBe(405);
  });

  it("webGiftCreate: аноним, авторизованный покупатель, giftPastDate, 400, 429 на buyerLocale и 405", async () => {
    const anon = await call({ method: "POST", url: "/api/v1/web/gifts", headers: { "x-real-ip": "10.0.0.1" }, payload: giftCreateBody });
    expect(anon.statusCode).toBe(200);
    expect(anon.headers["cache-control"]).toBe("no-store");
    expect(anon.json()).toEqual({ ok: true, token: GIFT_TOKEN, amount: 29000 });
    expect(ports.ensureCatalog).toHaveBeenCalledTimes(1);
    expect(ports.purchaseGift).toHaveBeenCalledWith({ ...giftCreateBody, buyerUserId: null });
    expect(limiter.hits).toEqual(["gift:10.0.0.1"]);

    const logged = await call({ method: "POST", url: "/api/v1/web/gifts", headers: asOwner, payload: giftCreateBody });
    expect(logged.statusCode).toBe(200);
    expect(ports.purchaseGift).toHaveBeenLastCalledWith({ ...giftCreateBody, buyerUserId: OWNER.id });

    ports.purchaseGift.mockRejectedValueOnce(new OrderingError("giftPastDate"));
    const past = await call({ method: "POST", url: "/api/v1/web/gifts", payload: { ...giftCreateBody, sendAt: "2020-01-01" } });
    expect(past.statusCode).toBe(200);
    expect(past.json()).toEqual({ ok: false, error: "giftPastDate" });

    limiter.deny = true;
    const limited = await call({ method: "POST", url: "/api/v1/web/gifts", headers: { [LOCALE_HEADER]: "ru" }, payload: giftCreateBody });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: messagesFor("kk").gift.form.errors.tooMany, code: "tooMany" });
    expect(ports.purchaseGift).toHaveBeenCalledTimes(3);

    expect((await call({ method: "POST", url: "/api/v1/web/gifts", payload: { plan: "nope" } })).statusCode).toBe(400);
    expect((await call({ method: "GET", url: "/api/v1/web/gifts" })).statusCode).toBe(405);
  });

  it("webGiftClaim: 200, неверный формат, 429 на языке запроса и 405", async () => {
    const ok = await call({ method: "POST", url: "/api/v1/web/gifts/claim", headers: { "x-real-ip": "10.0.0.2" }, payload: { token: GIFT_TOKEN } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ token: GIFT_TOKEN });
    expect(limiter.hits).toEqual(["gift-claim:10.0.0.2"]);

    const short = await call({ method: "POST", url: "/api/v1/web/gifts/claim", payload: { token: "bad" } });
    expect(short.statusCode).toBe(200);
    expect(short.json()).toEqual({ token: null });
    expect(ports.claimGiftPayment).toHaveBeenCalledTimes(1);

    limiter.deny = true;
    const limited = await call({ method: "POST", url: "/api/v1/web/gifts/claim", headers: { [LOCALE_HEADER]: "en" }, payload: { token: GIFT_TOKEN } });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: messagesFor("en").common.errors.tooMany, code: "tooMany" });

    // GET /api/v1/web/gifts/claim попадает в webGiftStatus ({token} = "claim") → 404; DELETE → 405.
    const wrong = await call({ method: "DELETE", url: "/api/v1/web/gifts/claim" });
    expect(wrong.statusCode).toBe(405);
    expect(wrong.headers.allow).toBe("GET, POST");
  });

  it("webRedeemCheck, webLetterInvite, webReviewPage, webUnsubscribeLink и webUnsubscribe", async () => {
    const redeemOk = await call({ method: "GET", url: "/api/v1/web/redeem?code=gift-aaaa-bbbb" });
    expect(redeemOk.statusCode).toBe(200);
    expect(v1.webRedeemCheck.response.parse(redeemOk.json())).toMatchObject({ check: { ok: true, code: "GIFT-AAAA-BBBB" }, gift: { recipientName: "Мама" } });

    const redeemBad = await call({ method: "GET", url: "/api/v1/web/redeem?code=nope" });
    expect(redeemBad.json()).toEqual({ check: { ok: false, error: "notFound" }, gift: null });
    expect(ports.giftByPromo).toHaveBeenCalledTimes(1);

    const letterOk = await call({ method: "GET", url: `/api/v1/web/letter-invite/${INVITE_TOKEN}` });
    expect(letterOk.statusCode).toBe(200);
    expect(v1.webLetterInvite.response.parse(letterOk.json())).toMatchObject({ title: "Мамина книга", status: "draft" });
    expect((await call({ method: "GET", url: "/api/v1/web/letter-invite/short" })).statusCode).toBe(404);
    expect((await call({ method: "GET", url: "/api/v1/web/letter-invite/unknown_token_123" })).json().code).toBe("letterNotFound");

    const signedT = new URL(reviewUrl(ORDER_ID, "ru")).searchParams.get("t")!;
    const revByToken = await call({ method: "GET", url: `/api/v1/web/review-page/${ORDER_ID}?t=${encodeURIComponent(signedT)}` });
    expect(revByToken.statusCode).toBe(200);
    expect(v1.webReviewPage.response.parse(revByToken.json())).toMatchObject({ number: 1042, state: { defaultName: "Алия" } });

    const revByOwner = await call({ method: "GET", url: `/api/v1/web/review-page/${ORDER_ID}`, headers: asOwner });
    expect(revByOwner.statusCode).toBe(200);

    ports.openReview.mockRejectedValueOnce(new FeedbackError("reviewNotAllowed"));
    const revNotAllowed = await call({ method: "GET", url: `/api/v1/web/review-page/${ORDER_ID}`, headers: asOwner });
    expect(revNotAllowed.statusCode).toBe(200);
    expect(revNotAllowed.json().state).toBeNull();

    expect((await call({ method: "GET", url: `/api/v1/web/review-page/${ORDER_ID}` })).statusCode).toBe(404);
    expect((await call({ method: "GET", url: `/api/v1/web/review-page/${ORDER_ID}`, headers: asStranger })).statusCode).toBe(404);
    expect((await call({ method: "GET", url: "/api/v1/web/review-page/not-a-uuid" })).statusCode).toBe(400);

    const unsubCheck = await call({ method: "GET", url: `/api/v1/web/unsubscribe?u=${OWNER.id}&t=valid-sig` });
    expect(unsubCheck.statusCode).toBe(200);
    expect(unsubCheck.json()).toEqual({ valid: true });

    const unsubPost = await call({ method: "POST", url: "/api/v1/web/unsubscribe", payload: { u: OWNER.id, t: "valid-sig" } });
    expect(unsubPost.statusCode).toBe(200);
    expect(unsubPost.json()).toEqual({ ok: true });
    expect(ports.unsubscribe).toHaveBeenCalledWith(OWNER.id, "valid-sig");
    expect((await call({ method: "DELETE", url: "/api/v1/web/unsubscribe" })).statusCode).toBe(405);
  });
});

describe("webLandingVisit: переход на рекламный лендинг", () => {
  const IG_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 357.0.0.25.101";

  it("пишет заход и нажатие с метками, устройством по User-Agent и обрезанными полями", async () => {
    const res = await call({
      method: "POST",
      url: "/api/v1/web/landing-visits",
      headers: { "user-agent": IG_UA },
      payload: { code: "lpk7x2m9", landing: "skidka", event: "click", utmSource: " instagram ", utmCampaign: "skidka-nov", fbclid: "IwAR0abc", fbp: "fb.1.1.2", adId: "120200" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(ports.recordLandingVisit).toHaveBeenCalledWith(
      expect.objectContaining({ code: "lpk7x2m9", landing: "skidka", utmSource: "instagram", utmCampaign: "skidka-nov", utmMedium: "", fbclid: "IwAR0abc", fbp: "fb.1.1.2", adId: "120200", device: "iphone", inApp: "instagram", userAgent: IG_UA }),
      "click",
    );
  });

  it("чужой код или лендинг — 400 без записи; неверное событие — 400; GET — 405", async () => {
    expect((await call({ method: "POST", url: "/api/v1/web/landing-visits", payload: { code: "insta-bio", landing: "skidka", event: "view" } })).statusCode).toBe(400);
    expect((await call({ method: "POST", url: "/api/v1/web/landing-visits", payload: { code: "lpk7x2m9", landing: "love", event: "view" } })).statusCode).toBe(400);
    expect((await call({ method: "POST", url: "/api/v1/web/landing-visits", payload: { code: "lpk7x2m9", landing: "skidka", event: "open" } })).statusCode).toBe(400);
    expect(ports.recordLandingVisit).not.toHaveBeenCalled();
    expect((await call({ method: "GET", url: "/api/v1/web/landing-visits" })).statusCode).toBe(405);
  });
});

describe("Контекст 3: 10 маршрутов сайта (@SiteRoute, /api/... и /api/v1/site/...)", () => {
  it("GET /api/gifts/{token}/pdf: бинарный PDF, 404 и 405 на обоих префиксах", async () => {
    for (const url of [`/api/gifts/${GIFT_TOKEN}/pdf`, `/api/v1/site/gifts/${GIFT_TOKEN}/pdf`]) {
      const res = await call({ method: "GET", url });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/pdf");
      expect(res.headers["content-disposition"]).toBe(`attachment; filename="${messagesFor("ru").gift.card.filename(17)}"`);
      expect(res.headers["cache-control"]).toBe("private, no-store");
      expect(Buffer.from(res.rawPayload).equals(Buffer.from([0x25, 0x50, 0x44, 0x46]))).toBe(true);
    }

    ports.giftPdf.mockResolvedValueOnce({ gift: { status: "pending_payment", locale: "ru", number: 17 }, pdf: new Uint8Array([1]) });
    expect((await call({ method: "GET", url: `/api/gifts/${GIFT_TOKEN}/pdf` })).statusCode).toBe(404);
    expect((await call({ method: "GET", url: "/api/gifts/missing/pdf" })).statusCode).toBe(404);

    const wrong = await call({ method: "POST", url: `/api/gifts/${GIFT_TOKEN}/pdf` });
    expect(wrong.statusCode).toBe(405);
    expect(wrong.headers.allow).toBe("GET");
  });

  it("POST /api/letters/{token}: 200, 400 (битый JSON/валидация/honeypot), 404/409, 429 и 405", async () => {
    const valid = { authorName: "Света", relation: "сестра", text: "Очень люблю тебя, дорогая мама!" };
    for (const url of [`/api/letters/${INVITE_TOKEN}`, `/api/v1/site/letters/${INVITE_TOKEN}`]) {
      const res = await call({ method: "POST", url, headers: { "x-real-ip": "10.0.1.1" }, payload: valid });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    }
    expect(ports.submitLetter).toHaveBeenCalledWith(INVITE_TOKEN, valid);

    const junk = await call({ method: "POST", url: `/api/letters/${INVITE_TOKEN}`, headers: { "content-type": "application/json" }, payload: "{broken" });
    expect(junk.statusCode).toBe(400);
    expect(junk.json().code).toBe("badRequest");

    const shortText = await call({ method: "POST", url: `/api/letters/${INVITE_TOKEN}`, payload: { authorName: "А", text: "короче" } });
    expect(shortText.statusCode).toBe(400);
    expect(shortText.json().code).toBe("letterShort");

    const bot = await call({ method: "POST", url: `/api/letters/${INVITE_TOKEN}`, payload: { ...valid, website: "https://spam.example" } });
    expect(bot.statusCode).toBe(400);
    expect(bot.json().code).toBe("badData");

    ports.submitLetter.mockRejectedValueOnce(new AuthoringError("letterClosed"));
    expect((await call({ method: "POST", url: `/api/letters/${INVITE_TOKEN}`, payload: valid })).statusCode).toBe(404);

    limiter.deny = true;
    const rate = await call({ method: "POST", url: `/api/letters/${INVITE_TOKEN}`, payload: valid });
    expect(rate.statusCode).toBe(429);
    expect(rate.json().code).toBe("letterRate");

    const wrong = await call({ method: "GET", url: `/api/letters/${INVITE_TOKEN}` });
    expect(wrong.statusCode).toBe(405);
    expect(wrong.headers.allow).toBe("POST");
  });

  it("GET /api/reviews/photo/{id}: публичное JPEG, приватное автору/сотруднику с reviews.manage, 404 и 405", async () => {
    for (const url of [`/api/reviews/photo/${REVIEW_ID}`, `/api/v1/site/reviews/photo/${REVIEW_ID}`]) {
      const res = await call({ method: "GET", url });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("image/jpeg");
      expect(res.headers["cache-control"]).toBe("public, max-age=86400");
      expect(Buffer.from(res.rawPayload).equals(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))).toBe(true);
    }

    expect((await call({ method: "GET", url: "/api/reviews/photo/not-a-uuid" })).statusCode).toBe(404);

    ports.reviewPhoto.mockResolvedValue({ key: "reviews/private.jpg", published: false, userId: OWNER.id });
    expect((await call({ method: "GET", url: `/api/reviews/photo/${REVIEW_ID}` })).statusCode).toBe(404);
    expect((await call({ method: "GET", url: `/api/reviews/photo/${REVIEW_ID}`, headers: asStranger })).statusCode).toBe(404);
    expect((await call({ method: "GET", url: `/api/reviews/photo/${REVIEW_ID}`, headers: asLimitedStaff })).statusCode).toBe(404);
    expect((await call({ method: "GET", url: `/api/reviews/photo/${REVIEW_ID}`, headers: asGatedStaff })).statusCode).toBe(404);

    const byOwner = await call({ method: "GET", url: `/api/reviews/photo/${REVIEW_ID}`, headers: asOwner });
    expect(byOwner.statusCode).toBe(200);
    expect(byOwner.headers["cache-control"]).toBe("private, no-store");

    const byStaff = await call({ method: "GET", url: `/api/reviews/photo/${REVIEW_ID}`, headers: asReviewStaff });
    expect(byStaff.statusCode).toBe(200);
    expect(byStaff.headers["cache-control"]).toBe("private, no-store");

    const wrong = await call({ method: "POST", url: `/api/reviews/photo/${REVIEW_ID}` });
    expect(wrong.statusCode).toBe(405);
    expect(wrong.headers.allow).toBe("GET");
  });

  it("POST /api/reviews/{orderId}: multipart с фото/удалением, ссылка t и владелец, CSRF, 400, 413, 429, 404, 409 и 405", async () => {
    const boundary = "----mb-review";
    const signedT = new URL(reviewUrl(ORDER_ID, "ru")).searchParams.get("t")!;
    const withPhoto = buildMultipart(
      boundary,
      { t: signedT, rating: "5", text: "Чудесная книга!", authorName: "Алия", city: "Алматы", consent: "1" },
      { field: "photo", name: "book.jpg", type: "image/jpeg", data: "JPEG-BYTES" },
    );

    for (const url of [`/api/reviews/${ORDER_ID}`, `/api/v1/site/reviews/${ORDER_ID}`]) {
      const res = await call({
        method: "POST",
        url,
        headers: { ...originOk, "content-type": `multipart/form-data; boundary=${boundary}`, "x-real-ip": "10.0.2.2" },
        payload: withPhoto,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: "new", thankYouCode: "THX-1", hasPhoto: true });
    }
    const [orderIdArg, inputArg, photoArg] = ports.submitReview.mock.calls[0];
    expect(orderIdArg).toBe(ORDER_ID);
    expect(inputArg).toEqual({ rating: 5, text: "Чудесная книга!", authorName: "Алия", city: "Алматы", consent: true });
    expect(typeof photoArg === "object" && "file" in photoArg && photoArg.file.toString("utf8")).toBe("JPEG-BYTES");

    const removePayload = buildMultipart(boundary, { rating: "4", text: "Хорошо", authorName: "Айгерим", city: "", consent: "0", removePhoto: "1" });
    const removeRes = await call({
      method: "POST",
      url: `/api/reviews/${ORDER_ID}`,
      headers: { ...asOwner, ...originOk, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: removePayload,
    });
    expect(removeRes.statusCode).toBe(200);
    expect(ports.submitReview).toHaveBeenLastCalledWith(ORDER_ID, { rating: 4, text: "Хорошо", authorName: "Айгерим", city: "", consent: false }, "remove");

    // UUID проверяется раньше Origin (паритет с review-submit.ts).
    expect((await call({ method: "POST", url: "/api/reviews/not-a-uuid", headers: originBad })).statusCode).toBe(400);
    expect((await call({ method: "POST", url: `/api/reviews/${ORDER_ID}`, headers: originBad })).statusCode).toBe(403);

    const tooLarge = await call({
      method: "POST",
      url: `/api/reviews/${ORDER_ID}`,
      headers: { ...originOk, "content-length": String(17 * 1024 * 1024), "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: removePayload,
    });
    expect(tooLarge.statusCode).toBe(413);
    expect(tooLarge.json().code).toBe("reviewPhotoInvalid");

    const unauth = await call({
      method: "POST",
      url: `/api/reviews/${ORDER_ID}`,
      headers: { ...originOk, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: removePayload,
    });
    expect(unauth.statusCode).toBe(404);
    expect(unauth.json().code).toBe("reviewNotFound");

    ports.submitReview.mockRejectedValueOnce(new FeedbackError("reviewLocked"));
    const locked = await call({
      method: "POST",
      url: `/api/reviews/${ORDER_ID}`,
      headers: { ...asOwner, ...originOk, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: removePayload,
    });
    expect(locked.statusCode).toBe(409);
    expect(locked.json().code).toBe("reviewLocked");

    limiter.deny = true;
    const rate = await call({ method: "POST", url: `/api/reviews/${ORDER_ID}`, headers: originOk });
    expect(rate.statusCode).toBe(429);
    expect(rate.json().code).toBe("reviewRate");

    const wrong = await call({ method: "GET", url: `/api/reviews/${ORDER_ID}` });
    expect(wrong.statusCode).toBe(405);
    expect(wrong.headers.allow).toBe("POST");
  });

  it("POST /api/chat/callback: 200 (user vs staff), CSRF 403, widgetOff 403, 400, 429 и 405", async () => {
    const body = { name: "Айгерим", phone: "+7 (701) 555-44-33", comment: "Позвоните после 18", page: "/gift" };
    for (const url of ["/api/chat/callback", "/api/v1/site/chat/callback"]) {
      const res = await call({ method: "POST", url, headers: { ...asOwner, ...originOk, "x-real-ip": "10.0.3.3" }, payload: body });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    }
    expect(ports.requestCallback).toHaveBeenCalledWith({ ...body, userId: OWNER.id });

    // Сотрудник не привязывается как клиент (userId: null).
    await call({ method: "POST", url: "/api/chat/callback", headers: { ...asReviewStaff, ...originOk }, payload: body });
    expect(ports.requestCallback).toHaveBeenLastCalledWith({ ...body, userId: null });

    expect((await call({ method: "POST", url: "/api/chat/callback", headers: originBad, payload: body })).statusCode).toBe(403);

    ports.widgetConfig.mockResolvedValueOnce({ enabled: false, chat: false, whatsapp: "" });
    const off = await call({ method: "POST", url: "/api/chat/callback", headers: originOk, payload: body });
    expect(off.statusCode).toBe(403);
    expect(off.json().code).toBe("widgetOff");

    const badPhone = await call({ method: "POST", url: "/api/chat/callback", headers: originOk, payload: { phone: "12345" } });
    expect(badPhone.statusCode).toBe(400);
    expect(badPhone.json().code).toBe("widgetPhone");

    const badJson = await call({ method: "POST", url: "/api/chat/callback", headers: { ...originOk, "content-type": "application/json" }, payload: "{bad" });
    expect(badJson.statusCode).toBe(400);
    expect(badJson.json().code).toBe("badRequest");

    limiter.deny = true;
    const rate = await call({ method: "POST", url: "/api/chat/callback", headers: originOk, payload: body });
    expect(rate.statusCode).toBe(429);
    expect(rate.json().code).toBe("widgetRate");

    const wrong = await call({ method: "GET", url: "/api/chat/callback" });
    expect(wrong.statusCode).toBe(405);
    expect(wrong.headers.allow).toBe("POST");
  });

  it("GET и POST /api/chat: история, Set-Cookie нового посетителя, существующий cookie, CSRF, 403, 400, 429 и 405", async () => {
    const empty = await call({ method: "GET", url: "/api/chat" });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ messages: [] });
    expect(ports.siteMessages).not.toHaveBeenCalled();

    for (const url of ["/api/chat?after=2026-11-20T09:00:00.000Z", "/api/v1/site/chat?after=2026-11-20T09:00:00.000Z"]) {
      const hist = await call({ method: "GET", url, headers: { cookie: `mb_chat=${VISITOR_TOKEN}` } });
      expect(hist.statusCode).toBe(200);
      expect(hist.headers["cache-control"]).toBe("no-store");
      expect(hist.json().messages).toHaveLength(1);
    }
    expect(ports.siteMessages).toHaveBeenCalledWith(VISITOR_TOKEN, new Date("2026-11-20T09:00:00.000Z"));

    const fresh = await call({ method: "POST", url: "/api/chat", headers: { ...asOwner, ...originOk }, payload: { text: "Здравствуйте!" } });
    expect(fresh.statusCode).toBe(200);
    expect(fresh.json()).toEqual({ ok: true });
    expect(String(fresh.headers["set-cookie"])).toMatch(/^mb_chat=[\w-]+; Path=\/; Expires=.*; Max-Age=15552000; HttpOnly; SameSite=lax$/);
    expect(ports.postSiteChat).toHaveBeenCalledWith(expect.objectContaining({ text: "Здравствуйте!", userId: OWNER.id, userName: OWNER.name }));

    const existing = await call({
      method: "POST",
      url: "/api/v1/site/chat",
      headers: { ...originOk, cookie: `mb_chat=${VISITOR_TOKEN}` },
      payload: { text: "Продолжаю диалог" },
    });
    expect(existing.statusCode).toBe(200);
    expect(existing.headers["set-cookie"]).toBeUndefined();
    expect(ports.postSiteChat).toHaveBeenLastCalledWith(expect.objectContaining({ token: VISITOR_TOKEN, text: "Продолжаю диалог", userId: null }));

    expect((await call({ method: "POST", url: "/api/chat", headers: originBad, payload: { text: "hi" } })).statusCode).toBe(403);

    ports.widgetConfig.mockResolvedValueOnce({ enabled: true, chat: false, whatsapp: "" });
    expect((await call({ method: "POST", url: "/api/chat", headers: originOk, payload: { text: "hi" } })).json().code).toBe("widgetOff");

    const emptyText = await call({ method: "POST", url: "/api/chat", headers: originOk, payload: { text: "   " } });
    expect(emptyText.statusCode).toBe(400);
    expect(emptyText.json().code).toBe("widgetText");

    limiter.deny = true;
    const rate = await call({ method: "POST", url: "/api/chat", headers: originOk, payload: { text: "hi" } });
    expect(rate.statusCode).toBe(429);
    expect(rate.json().code).toBe("widgetRate");

    const wrong = await call({ method: "DELETE", url: "/api/chat" });
    expect(wrong.statusCode).toBe(405);
    expect(wrong.headers.allow).toBe("GET, POST");
  });

  it("GET /api/calendar/{token} и GET /api/chat-avatar/{file}: бинарные/iCal, 404 и 405", async () => {
    for (const url of ["/api/calendar/cal_token_1234567890abcdef.ICS", "/api/v1/site/calendar/cal_token_1234567890abcdef.ics"]) {
      const cal = await call({ method: "GET", url });
      expect(cal.statusCode).toBe(200);
      expect(cal.headers["content-type"]).toBe("text/calendar; charset=utf-8");
      expect(cal.headers["cache-control"]).toBe("private, max-age=300");
      expect(cal.headers["content-disposition"]).toBe('inline; filename="mybooks-crm.ics"');
      expect(cal.body).toContain("BEGIN:VCALENDAR");
    }
    const cal404 = await call({ method: "GET", url: "/api/calendar/revoked.ics" });
    expect(cal404.statusCode).toBe(404);
    expect(cal404.body).toBe("Not found");
    expect((await call({ method: "POST", url: "/api/calendar/revoked.ics" })).statusCode).toBe(405);

    for (const url of ["/api/chat-avatar/ok.webp", "/api/v1/site/chat-avatar/ok.webp"]) {
      const av = await call({ method: "GET", url });
      expect(av.statusCode).toBe(200);
      expect(av.headers["content-type"]).toBe("image/webp");
      expect(av.headers["cache-control"]).toBe("private, max-age=31536000, immutable");
      expect(av.headers["x-content-type-options"]).toBe("nosniff");
      expect(Buffer.from(av.rawPayload).equals(Buffer.from([0x52, 0x49, 0x46, 0x46]))).toBe(true);
    }
    const av404 = await call({ method: "GET", url: "/api/chat-avatar/bad.webp" });
    expect(av404.statusCode).toBe(404);
    expect(av404.body).toBe("");
    expect((await call({ method: "POST", url: "/api/chat-avatar/ok.webp" })).statusCode).toBe(405);
  });

  it("GET /api/r/{code} и GET /api/go/{slug}: редиректы 302, Set-Cookie, локаль kk, лимит и 405", async () => {
    for (const url of ["/api/r/ASEL-7K2Q", "/api/v1/site/r/ASEL-7K2Q"]) {
      const res = await call({ method: "GET", url, headers: { [LOCALE_HEADER]: "kk" } });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe("http://localhost:3000/kk?utm_campaign=invite-ASEL-7K2Q");
      expect(res.headers["cache-control"]).toBe("no-store");
      const cookies = Array.isArray(res.headers["set-cookie"]) ? res.headers["set-cookie"] : [String(res.headers["set-cookie"])];
      expect(cookies).toHaveLength(2);
      expect(cookies[0]).toMatch(/^mb_invite=ASEL-7K2Q;/);
      expect(cookies[1]).toMatch(/^mb_src=/);
    }

    const withSrc = await call({ method: "GET", url: "/api/r/ASEL-7K2Q", headers: { cookie: "mb_src=existing" } });
    expect(withSrc.statusCode).toBe(302);
    expect(String(withSrc.headers["set-cookie"])).toMatch(/^mb_invite=ASEL-7K2Q;/);

    const unknown = await call({ method: "GET", url: "/api/r/NOPE-1234" });
    expect(unknown.statusCode).toBe(302);
    expect(unknown.headers.location).toBe("http://localhost:3000/");
    expect(unknown.headers["set-cookie"]).toBeUndefined();

    limiter.deny = true;
    const rate = await call({ method: "GET", url: "/api/r/ASEL-7K2Q" });
    expect(rate.statusCode).toBe(302);
    expect(rate.headers.location).toBe("http://localhost:3000/");
    expect(rate.headers["set-cookie"]).toBeUndefined();

    expect((await call({ method: "POST", url: "/api/r/ASEL-7K2Q" })).statusCode).toBe(405);

    for (const url of ["/api/go/insta", "/api/v1/site/go/insta"]) {
      const go = await call({ method: "GET", url, headers: { "user-agent": "Mozilla/5.0" } });
      expect(go.statusCode).toBe(302);
      expect(go.headers.location).toBe("https://mybooks.kz/?utm_source=instagram&lnk=insta");
      expect(go.headers["cache-control"]).toBe("no-store");
    }
    expect(ports.followShortLink).toHaveBeenCalledWith("insta", "Mozilla/5.0");

    const goMiss = await call({ method: "GET", url: "/api/go/missing" });
    expect(goMiss.statusCode).toBe(302);
    expect(goMiss.headers.location).toBe("http://localhost:3000/");
    expect(goMiss.headers["cache-control"]).toBeUndefined();

    expect((await call({ method: "POST", url: "/api/go/insta" })).statusCode).toBe(405);
  });
});
