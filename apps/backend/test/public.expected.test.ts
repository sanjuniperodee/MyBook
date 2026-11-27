import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCALE_HEADER } from "@/i18n/config";
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
const ALL_USERS = [OWNER, STRANGER, REVIEW_STAFF];

const ORDER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REVIEW_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const GIFT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const GIFT_TOKEN = "Gift_token_abcdefghijklmn";
const INVITE_TOKEN = "invite_token_1234";
const FILE_TOKEN_OK = "AbCdEf1234";
const VISITOR_TOKEN = "visitor_token_1234567890abcd";
const GENERATED_VISITOR = "fixed_fresh_visitor_token_123456";
const PUBLISHED_AT = new Date("2026-11-20T10:00:00.000Z");

const giftPaid = {
  id: GIFT_ID,
  number: 17,
  token: GIFT_TOKEN,
  status: "paid" as const,
  plan: "hardcover",
  amount: 29000,
  currency: "KZT",
  locale: "kk" as const,
  buyerName: "Асель",
  buyerEmail: "asel@mybooks.kz",
  buyerPhone: "+77011112233",
  recipientName: "Мама",
  recipientEmail: "mama@mybooks.kz",
  message: "С любовью",
  sendAt: "2026-12-01",
  sentAt: null,
  paymentClaimedAt: PUBLISHED_AT,
  promo: { id: "promo-1", code: "GIFT-AAAA-BBBB", usedCount: 0, expiresAt: PUBLISHED_AT },
};

const orderDetailsFixture = {
  number: 1042,
  book: {
    theme: "mom",
    title: "Наша история",
    coverTemplate: "linen",
    coverLines: true,
    format: "a5",
    authorName: "Алия",
    recipientName: "Мама",
    hideRecipientOnCover: false,
    namesOnCover: "",
  },
};

const shared = vi.hoisted(() => ({
  allowRate: true,
  gift: null as Record<string, unknown> | null,
  widget: { enabled: true, chat: true, whatsapp: "77010000000" },
  reviewPhotoPublished: true,
  openReviewError: null as Error | null,
  submitReviewError: null as Error | null,
  submitLetterError: null as Error | null,
  giftPastDate: false,
  summaryCount: 12,
}));

vi.mock("@/shared/crypto", async (orig) => {
  const actual = await orig<typeof import("@/shared/crypto")>();
  return { ...actual, randomToken: () => GENERATED_VISITOR };
});
vi.mock("@/server/rateLimit", () => ({
  rateLimit: async () => shared.allowRate,
  trustedClientIp: async () => "203.0.113.10",
}));
vi.mock("@/server/auth", async () => {
  const shim = await import("@/shared/infrastructure/http/request");
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
vi.mock("@/server/access", async () => {
  const { getCurrentUser } = await import("@/server/auth");
  class MockForbiddenError extends Error {
    static is(err: unknown): err is MockForbiddenError {
      return err instanceof MockForbiddenError;
    }
  }
  return {
    ForbiddenError: MockForbiddenError,
    getStaff: async () => {
      const u = await getCurrentUser();
      if (!u || u.id !== REVIEW_STAFF.id) return null;
      const context = new StaffContext(u.id, "Модератор", "moderator", "all", new Set(["reviews.manage"]), false, { isPhoneEmail });
      return { user: u, roleName: "Модератор", roleKey: "moderator", scope: "all", permissions: context.permissions, isOwner: false, context };
    },
    can: (staff: { context: StaffContext } | null, ...perms: Parameters<StaffContext["can"]>) => Boolean(staff?.context.can(...perms)),
  };
});
vi.mock("@/server/catalog", () => ({
  ensureCatalog: async () => {},
  readCatalogSettings: async () => ({
    overrides: { hardcover: { price: 31000 } },
    registration: true,
    giftNote: false,
    seller: { legalName: "ИП MyBooks", bin: "123", phone: "+77010000000", whatsapp: "77010000000" },
  }),
}));
vi.mock("@/server/requisites", () => ({
  manualPaymentProps: async (m: { common: { manualPayment: { title: string } } }) => ({
    title: m.common.manualPayment.title,
    steps: ["Переведите на +7 701 555 44 33"],
  }),
}));
vi.mock("@/server/kaspi-view", () => ({
  kaspiPaymentProps: async (_target: unknown, defaultPhone: string) => ({ initial: null, defaultPhone }),
}));
vi.mock("@/server/answerFiles", () => ({
  publicFile: async (token: string) =>
    token === FILE_TOKEN_OK
      ? {
          file: { kind: "video", status: "ready", hasPoster: true, width: 1280, height: 720, durationSec: 45 },
          bookTitle: "Наша книга",
          authorName: "Айгерим",
          caption: "Поздравление",
          language: "ru",
        }
      : null,
}));
vi.mock("@/server/container", () => ({
  container: () => ({
    messaging: {
      widgetConfig: async () => shared.widget,
      siteMessages: async () => [{ id: "m1", mine: false, text: "Здравствуйте!", at: PUBLISHED_AT.toISOString() }],
      site: { post: async () => {}, requestCallback: async () => {} },
      avatarFile: async (file: string) => (file === "ok.webp" ? new Uint8Array([0x52, 0x49, 0x46, 0x46]) : null),
    },
    marketing: {
      service: {
        shopWhatsapp: async () => "77015554433",
        follow: async (slug: string) => (slug === "insta" ? "https://mybooks.kz/?utm_source=instagram&lnk=insta" : null),
      },
    },
    referrals: {
      service: {
        welcome: async (code: string) => (code === "ASEL-7K2Q" ? { code, percent: 10, from: "Асель" } : null),
      },
    },
    feedback: {
      queries: {
        showcase: async () => [
          { id: REVIEW_ID, rating: 5, text: "Очень трогательно, мама плакала", authorName: "Дина", city: "Астана", theme: "mom", locale: "ru", photo: { width: 800, height: 600 }, publishedAt: PUBLISHED_AT },
        ],
        summary: async () => ({ count: shared.summaryCount, average: 4.9 }),
        photo: async (id: string) => (id === REVIEW_ID ? { key: "reviews/r1.jpg", published: shared.reviewPhotoPublished, userId: OWNER.id } : null),
      },
      photoFile: async () => Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      reviews: {
        open: async () => {
          if (shared.openReviewError) throw shared.openReviewError;
          return {
            order: { name: "Алия" },
            review: { snapshot: () => ({ rating: 5, text: "Чудесно", authorName: "Алия", city: "Алматы", consent: true, photo: null, status: "new", thankYouCode: "THX-1" }) },
          };
        },
        submit: async () => {
          if (shared.submitReviewError) throw shared.submitReviewError;
          return { status: "new", thankYouCode: "THX-1", photo: { key: "k", width: 100, height: 100 } };
        },
      },
    },
    ordering: {
      queries: {
        giftByToken: async (token: string) => (token === GIFT_TOKEN ? shared.gift : undefined),
        giftByPromo: async () => shared.gift,
        orderDetails: async (id: string) => (id === ORDER_ID ? orderDetailsFixture : undefined),
        ownedOrderDetails: async (id: string, userId: string) => (id === ORDER_ID && userId === OWNER.id ? orderDetailsFixture : undefined),
      },
      promos: {
        check: async (code: string) =>
          code.toUpperCase() === "GIFT-AAAA-BBBB"
            ? { ok: true, promo: { id: "promo-1", code: "GIFT-AAAA-BBBB", kind: "fixed", value: 29000, label: "29 000 ₸" } }
            : { ok: false, error: "notFound" },
      },
      gifts: {
        purchase: async () => {
          if (shared.giftPastDate) throw new OrderingError("giftPastDate");
          return { token: GIFT_TOKEN, amount: 29000 };
        },
        claimPayment: async (token: string) => (token === GIFT_TOKEN ? { token } : null),
      },
      giftPdf: async (token: string) =>
        token === GIFT_TOKEN ? { gift: { status: "paid", locale: "ru", number: 17 }, pdf: Buffer.from([0x25, 0x50, 0x44, 0x46]) } : null,
    },
    authoring: {
      queries: {
        bookByInviteToken: async (token: string) =>
          token === INVITE_TOKEN
            ? { status: "draft", theme: "mom", title: "Мамина книга", authorName: "Алия", recipientName: "Мама", inviteText: "", coverTemplate: "linen", coverLines: true, format: "a5" }
            : undefined,
      },
      letters: {
        submit: async () => {
          if (shared.submitLetterError) throw shared.submitLetterError;
        },
      },
    },
    notifications: {
      subscriptions: {
        isValidLink: (u: string, t: string) => u === OWNER.id && t === "valid-sig",
        unsubscribe: async () => true,
      },
    },
    boards: {
      calendar: {
        feed: async (token: string) => (token === "cal_token_1234567890abcdef" ? "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n" : null),
      },
    },
  }),
}));

const { assertRoute } = await import("./expected");
const { redeemUrl } = await import("@/modules/ordering");

const staffAccess: StaffAccessPort = {
  async resolve(user) {
    if (user.id !== REVIEW_STAFF.id) return null;
    return { context: new StaffContext(user.id, "Модератор", "moderator", "all", new Set(["reviews.manage"]), false, { isPhoneEmail }), gate: null };
  },
};

const nestPorts: PublicPorts = {
  recordLandingVisit: async () => {},
  readCatalogSettings: async () => ({
    overrides: { hardcover: { price: 31000 } },
    registration: true,
    giftNote: false,
    seller: { legalName: "ИП MyBooks", bin: "123", phone: "+77010000000", whatsapp: "77010000000" },
  }),
  ensureCatalog: async () => {},
  widgetConfig: async () => shared.widget,
  shopWhatsapp: async () => "77015554433",
  reviewsShowcase: async () => [
    { id: REVIEW_ID, rating: 5, text: "Очень трогательно, мама плакала", authorName: "Дина", city: "Астана", theme: "mom", locale: "ru", photo: { width: 800, height: 600 }, publishedAt: PUBLISHED_AT },
  ],
  reviewsSummary: async () => ({ count: shared.summaryCount, average: 4.9 }),
  reviewPhoto: async (id) => (id === REVIEW_ID ? { key: "reviews/r1.jpg", published: shared.reviewPhotoPublished, userId: OWNER.id } : null),
  reviewPhotoFile: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  orderDetails: async (id) => (id === ORDER_ID ? orderDetailsFixture : null),
  isOrderOwner: async (id, userId) => id === ORDER_ID && userId === OWNER.id,
  openReview: async () => {
    if (shared.openReviewError) throw shared.openReviewError;
    return {
      order: { name: "Алия" },
      review: { snapshot: () => ({ rating: 5, text: "Чудесно", authorName: "Алия", city: "Алматы", consent: true, photo: null, status: "new", thankYouCode: "THX-1" }) },
    };
  },
  submitReview: async () => {
    if (shared.submitReviewError) throw shared.submitReviewError;
    return { status: "new", thankYouCode: "THX-1", hasPhoto: true };
  },
  inviteWelcome: async (code) => (code === "ASEL-7K2Q" ? { code, percent: 10, from: "Асель" } : null),
  followShortLink: async (slug) => (slug === "insta" ? "https://mybooks.kz/?utm_source=instagram&lnk=insta" : null),
  giftByToken: async (token) => (token === GIFT_TOKEN ? (shared.gift as typeof giftPaid | null) : null),
  giftPaymentProps: async (_giftId, defaultPhone, m) => ({
    online: null,
    manual: { title: m.common.manualPayment.title, steps: ["Переведите на +7 701 555 44 33"] },
    kaspi: { initial: null, defaultPhone },
  }),
  redeemUrl: (code, locale) => redeemUrl(code, locale),
  purchaseGift: async () => {
    if (shared.giftPastDate) throw new OrderingError("giftPastDate");
    return { token: GIFT_TOKEN, amount: 29000 };
  },
  claimGiftPayment: async (token) => (token === GIFT_TOKEN ? { token } : null),
  checkPromo: async (code) =>
    code.toUpperCase() === "GIFT-AAAA-BBBB"
      ? { ok: true, promo: { id: "promo-1", code: "GIFT-AAAA-BBBB", kind: "fixed", value: 29000, label: "29 000 ₸" } }
      : { ok: false, error: "notFound" },
  giftByPromo: async () => (shared.gift ? { locale: "kk", plan: "hardcover", recipientName: "Мама", buyerName: "Асель", message: "С любовью" } : null),
  giftPdf: async (token) => (token === GIFT_TOKEN ? { gift: { status: "paid", locale: "ru", number: 17 }, pdf: new Uint8Array([0x25, 0x50, 0x44, 0x46]) } : null),
  bookByInviteToken: async (token) =>
    token === INVITE_TOKEN
      ? { status: "draft", theme: "mom", title: "Мамина книга", authorName: "Алия", recipientName: "Мама", inviteText: "", coverTemplate: "linen", coverLines: true, format: "a5" }
      : null,
  submitLetter: async () => {
    if (shared.submitLetterError) throw shared.submitLetterError;
  },
  isValidUnsubscribeLink: (u, t) => u === OWNER.id && t === "valid-sig",
  unsubscribe: async () => {},
  publicAnswerFile: async (token) =>
    token === FILE_TOKEN_OK
      ? { file: { kind: "video", status: "ready", hasPoster: true, width: 1280, height: 720, durationSec: 45 }, bookTitle: "Наша книга", authorName: "Айгерим", caption: "Поздравление" }
      : null,
  siteMessages: async () => [{ id: "m1", mine: false, text: "Здравствуйте!", at: PUBLISHED_AT.toISOString() }],
  postSiteChat: async () => {},
  requestCallback: async () => {},
  calendarFeed: async (token) => (token === "cal_token_1234567890abcdef" ? "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n" : null),
  chatAvatarFile: async (file) => (file === "ok.webp" ? new Uint8Array([0x52, 0x49, 0x46, 0x46]) : null),
};

const asOwner = { cookie: `mb_session=${sessionOf(OWNER)}` };
const asStranger = { cookie: `mb_session=${sessionOf(STRANGER)}` };
const asReviewStaff = { cookie: `mb_session=${sessionOf(REVIEW_STAFF)}` };
const originOk = { origin: "http://localhost:3000" };
const originBad = { origin: "https://evil.example" };
const giftCreateBody = {
  plan: "hardcover",
  buyerName: "Асель",
  buyerEmail: "asel@mybooks.kz",
  buyerPhone: "+77011112233",
  recipientName: "Мама",
  recipientEmail: null,
  sendAt: null,
  message: "С праздником!",
  locale: "ru",
  buyerLocale: "kk",
};

let app: NestFastifyApplication;
let limiter: FakeLimiter;

beforeAll(async () => {
  // Фиксируем только Date (не setTimeout/setImmediate), чтобы Expires в Set-Cookie и дата mb_src совпадали без гонки секунд.
  vi.useFakeTimers({ now: new Date("2026-11-26T10:00:00.000Z"), toFake: ["Date"] });
  ({ app, limiter } = await bootTestApp({
    users: ALL_USERS,
    overrides: [
      [PUBLIC_PORTS, nestPorts],
      [STAFF_ACCESS, staffAccess],
    ],
  }));
});

afterAll(async () => {
  vi.useRealTimers();
  await app.close();
});

beforeEach(() => {
  limiter.hits.length = 0;
  limiter.deny = false;
  shared.allowRate = true;
  shared.gift = { ...giftPaid };
  shared.widget = { enabled: true, chat: true, whatsapp: "77010000000" };
  shared.reviewPhotoPublished = true;
  shared.openReviewError = null;
  shared.submitReviewError = null;
  shared.submitLetterError = null;
  shared.giftPastDate = false;
  shared.summaryCount = 12;
});

describe("ответы Nest байт в байт (эталон — прежний mybook-api): 13 контрактных маршрутов Контекста 3", () => {
  it("webAnswerFilePage, webSiteCatalog, webSiteChrome, webReviewsShowcase и webInviteWelcome", async () => {
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/web/answer-files/${FILE_TOKEN_OK}` });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/web/answer-files/123456789012" });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/web/answer-files/short" });

    await assertRoute({ nest: app, method: "GET", url: "/api/v1/web/site/catalog" });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/web/site/chrome" });

    await assertRoute({ nest: app, method: "GET", url: "/api/v1/web/reviews/showcase?limit=6&theme=mom" });
    shared.summaryCount = 2;
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/web/reviews/showcase" });

    await assertRoute({ nest: app, method: "GET", url: "/api/v1/web/invite/welcome?code=ASEL-7K2Q" });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/web/invite/welcome?code=bad%20code!" });
  });

  it("webGiftStatus, webGiftCreate, webGiftClaim и webRedeemCheck (включая 404, giftPastDate, 429)", async () => {
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/web/gifts/${GIFT_TOKEN}` });
    shared.gift = { ...giftPaid, status: "pending_payment", promo: null };
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/web/gifts/${GIFT_TOKEN}?locale=kk` });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/web/gifts/unknown_token", headers: { [LOCALE_HEADER]: "en" } });

    await assertRoute({ nest: app, method: "POST", url: "/api/v1/web/gifts", headers: asOwner, body: giftCreateBody });
    shared.giftPastDate = true;
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/web/gifts", body: { ...giftCreateBody, sendAt: "2020-01-01" } });
    shared.giftPastDate = false;
    limiter.deny = true;
    shared.allowRate = false;
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/web/gifts", headers: { [LOCALE_HEADER]: "ru" }, body: giftCreateBody });

    limiter.deny = false;
    shared.allowRate = true;
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/web/gifts/claim", body: { token: GIFT_TOKEN } });
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/web/gifts/claim", body: { token: "bad" } });
    limiter.deny = true;
    shared.allowRate = false;
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/web/gifts/claim", headers: { [LOCALE_HEADER]: "kk" }, body: { token: GIFT_TOKEN } });

    await assertRoute({ nest: app, method: "GET", url: "/api/v1/web/redeem?code=gift-aaaa-bbbb" });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/web/redeem?code=nope" });
  });

  it("webLetterInvite, webReviewPage, webUnsubscribeLink и webUnsubscribe", async () => {
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/web/letter-invite/${INVITE_TOKEN}` });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/web/letter-invite/short" });

    const signedT = new URL(reviewUrl(ORDER_ID, "ru")).searchParams.get("t")!;
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/web/review-page/${ORDER_ID}?t=${encodeURIComponent(signedT)}` });
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/web/review-page/${ORDER_ID}`, headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/web/review-page/${ORDER_ID}`, headers: asStranger });
    shared.openReviewError = new FeedbackError("reviewNotAllowed");
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/web/review-page/${ORDER_ID}`, headers: asOwner });

    await assertRoute({ nest: app, method: "GET", url: `/api/v1/web/unsubscribe?u=${OWNER.id}&t=valid-sig` });
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/web/unsubscribe?u=${OWNER.id}&t=wrong` });
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/web/unsubscribe", body: { u: OWNER.id, t: "valid-sig" } });
    await assertRoute({ nest: app, method: "DELETE", url: "/api/v1/web/unsubscribe" });
  });
});

describe("ответы Nest байт в байт (эталон — прежний mybook-api): 10 маршрутов сайта (@SiteRoute)", () => {
  it("GET /api/gifts/{token}/pdf, GET /api/calendar/{token}, GET /api/chat-avatar/{file}", async () => {
    for (const url of [`/api/gifts/${GIFT_TOKEN}/pdf`, `/api/v1/site/gifts/${GIFT_TOKEN}/pdf`]) {
      const { nestRes } = await assertRoute({ nest: app, method: "GET", url });
    }
    await assertRoute({ nest: app, method: "GET", url: "/api/gifts/missing/pdf" });
    await assertRoute({ nest: app, method: "POST", url: `/api/gifts/${GIFT_TOKEN}/pdf` });

    for (const url of ["/api/calendar/cal_token_1234567890abcdef.ics", "/api/v1/site/calendar/cal_token_1234567890abcdef.ICS"]) {
      const { nestRes } = await assertRoute({ nest: app, method: "GET", url });
    }
    await assertRoute({ nest: app, method: "GET", url: "/api/calendar/revoked.ics" });
    await assertRoute({ nest: app, method: "POST", url: "/api/calendar/revoked.ics" });

    for (const url of ["/api/chat-avatar/ok.webp", "/api/v1/site/chat-avatar/ok.webp"]) {
      const { nestRes } = await assertRoute({ nest: app, method: "GET", url });
    }
    await assertRoute({ nest: app, method: "GET", url: "/api/chat-avatar/bad.webp" });
    await assertRoute({ nest: app, method: "DELETE", url: "/api/chat-avatar/ok.webp" });
  });

  it("POST /api/letters/{token}: 200, 400 (битый JSON и zod), 404 домена, 429 и 405", async () => {
    const valid = { authorName: "Света", relation: "сестра", text: "Очень люблю тебя, мама!" };
    await assertRoute({ nest: app, method: "POST", url: `/api/letters/${INVITE_TOKEN}`, body: valid });
    await assertRoute({ nest: app, method: "POST", url: `/api/v1/site/letters/${INVITE_TOKEN}`, body: valid });
    await assertRoute({ nest: app, method: "POST", url: `/api/letters/${INVITE_TOKEN}`, headers: { "content-type": "application/json" }, body: "{oops" });
    await assertRoute({ nest: app, method: "POST", url: `/api/letters/${INVITE_TOKEN}`, body: { authorName: "А", text: "мало" } });

    shared.submitLetterError = new AuthoringError("letterClosed");
    await assertRoute({ nest: app, method: "POST", url: `/api/letters/${INVITE_TOKEN}`, body: valid });
    shared.submitLetterError = null;

    limiter.deny = true;
    shared.allowRate = false;
    await assertRoute({ nest: app, method: "POST", url: `/api/letters/${INVITE_TOKEN}`, body: valid });
    await assertRoute({ nest: app, method: "GET", url: `/api/letters/${INVITE_TOKEN}` });
  });

  it("GET /api/reviews/photo/{id} и POST /api/reviews/{orderId}: фото, права, multipart, CSRF, 400/403/404/409/413/429/405", async () => {
    const pub = await assertRoute({ nest: app, method: "GET", url: `/api/reviews/photo/${REVIEW_ID}` });
    await assertRoute({ nest: app, method: "GET", url: "/api/reviews/photo/not-a-uuid" });

    shared.reviewPhotoPublished = false;
    await assertRoute({ nest: app, method: "GET", url: `/api/reviews/photo/${REVIEW_ID}` });
    await assertRoute({ nest: app, method: "GET", url: `/api/reviews/photo/${REVIEW_ID}`, headers: asStranger });
    await assertRoute({ nest: app, method: "GET", url: `/api/reviews/photo/${REVIEW_ID}`, headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: `/api/reviews/photo/${REVIEW_ID}`, headers: asReviewStaff });
    await assertRoute({ nest: app, method: "POST", url: `/api/reviews/photo/${REVIEW_ID}` });

    const boundary = "----mb-parity";
    const signedT = new URL(reviewUrl(ORDER_ID, "ru")).searchParams.get("t")!;
    const multipart = [
      `--${boundary}\r\nContent-Disposition: form-data; name="t"\r\n\r\n${signedT}\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="rating"\r\n\r\n5\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="text"\r\n\r\nПрекрасно\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="authorName"\r\n\r\nАлия\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="city"\r\n\r\nАлматы\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="consent"\r\n\r\n1\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="p.jpg"\r\nContent-Type: image/jpeg\r\n\r\nJPGDATA\r\n`,
      `--${boundary}--\r\n`,
    ].join("");
    const mpHeaders = { ...originOk, "content-type": `multipart/form-data; boundary=${boundary}` };

    await assertRoute({ nest: app, method: "POST", url: `/api/reviews/${ORDER_ID}`, headers: mpHeaders, body: multipart });
    await assertRoute({ nest: app, method: "POST", url: `/api/v1/site/reviews/${ORDER_ID}`, headers: mpHeaders, body: multipart });
    await assertRoute({ nest: app, method: "POST", url: "/api/reviews/not-a-uuid", headers: { ...originBad, "content-type": `multipart/form-data; boundary=${boundary}` }, body: multipart });
    await assertRoute({ nest: app, method: "POST", url: `/api/reviews/${ORDER_ID}`, headers: { ...originBad, "content-type": `multipart/form-data; boundary=${boundary}` }, body: multipart });

    shared.submitReviewError = new FeedbackError("reviewLocked");
    await assertRoute({ nest: app, method: "POST", url: `/api/reviews/${ORDER_ID}`, headers: mpHeaders, body: multipart });
    shared.submitReviewError = null;

    limiter.deny = true;
    shared.allowRate = false;
    await assertRoute({ nest: app, method: "POST", url: `/api/reviews/${ORDER_ID}`, headers: mpHeaders, body: multipart });
    await assertRoute({ nest: app, method: "GET", url: `/api/reviews/${ORDER_ID}` });
  });

  it("POST /api/chat/callback, GET/POST /api/chat, GET /api/r/{code} и GET /api/go/{slug}", async () => {
    const cb = { name: "Айгерим", phone: "+7 701 555 44 33", comment: "Вечером", page: "/gift" };
    await assertRoute({ nest: app, method: "POST", url: "/api/chat/callback", headers: { ...asOwner, ...originOk }, body: cb });
    await assertRoute({ nest: app, method: "POST", url: "/api/chat/callback", headers: originBad, body: cb });
    await assertRoute({ nest: app, method: "POST", url: "/api/chat/callback", headers: originOk, body: { phone: "123" } });
    shared.widget = { enabled: false, chat: false, whatsapp: "" };
    await assertRoute({ nest: app, method: "POST", url: "/api/chat/callback", headers: originOk, body: cb });
    await assertRoute({ nest: app, method: "GET", url: "/api/chat/callback" });

    shared.widget = { enabled: true, chat: true, whatsapp: "77010000000" };
    await assertRoute({ nest: app, method: "GET", url: "/api/chat" });
    await assertRoute({ nest: app, method: "GET", url: "/api/chat?after=2026-11-20T09:00:00.000Z", headers: { cookie: `mb_chat=${VISITOR_TOKEN}` } });
    await assertRoute({ nest: app, method: "POST", url: "/api/chat", headers: { ...asOwner, ...originOk }, body: { text: "Привет!" } });
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/site/chat", headers: { ...originOk, cookie: `mb_chat=${VISITOR_TOKEN}` }, body: { text: "Снова я" } });
    await assertRoute({ nest: app, method: "POST", url: "/api/chat", headers: originBad, body: { text: "Привет!" } });
    await assertRoute({ nest: app, method: "POST", url: "/api/chat", headers: originOk, body: { text: "   " } });
    await assertRoute({ nest: app, method: "DELETE", url: "/api/chat" });

    const r1 = await assertRoute({ nest: app, method: "GET", url: "/api/r/ASEL-7K2Q", headers: { [LOCALE_HEADER]: "kk" } });
    const r2 = await assertRoute({ nest: app, method: "GET", url: "/api/v1/site/r/ASEL-7K2Q", headers: { cookie: "mb_src=prev" } });
    const r3 = await assertRoute({ nest: app, method: "GET", url: "/api/r/NOPE-1234" });
    await assertRoute({ nest: app, method: "POST", url: "/api/r/ASEL-7K2Q" });

    const g1 = await assertRoute({ nest: app, method: "GET", url: "/api/go/insta", headers: { "user-agent": "Mozilla/5.0" } });
    const g2 = await assertRoute({ nest: app, method: "GET", url: "/api/v1/site/go/missing" });
    await assertRoute({ nest: app, method: "POST", url: "/api/go/insta" });
  });
});
