import { routeWebToApi } from "./api";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messagesFor } from "@/i18n/messages";
import { createWebApiClient, v1WebAction, v1WebRead } from "@/server/v1-web-client";
import { v1SiteProxy } from "@/server/v1-proxy";
import {
  localGiftClaim,
  localGiftCreate,
  localGiftStatus,
  localInviteWelcome,
  localLetterInvite,
  localRedeemCheck,
  localReviewPage,
  localReviewsShowcase,
  localSiteCatalog,
  localSiteChrome,
  localUnsubscribe,
  localUnsubscribeLink,
} from "@/server/v1-local-bridge-public";
import { fake, owner, resetContainer, resetRequest, signIn } from "../doubles/web";

vi.mock("@/shared/infrastructure/http/request", async (real) => ({ ...(await real<object>()), ...(await import("../doubles/web")).nextHeaders, ...(await import("../doubles/web")).nextNavigation }));
vi.mock("@/server/container", async () => (await import("../doubles/web")).containerModule);
vi.mock("@/server/catalog", () => ({
  ensureCatalog: vi.fn(async () => {}),
  syncCatalogFromSettings: vi.fn(async () => {}),
  readCatalogSettings: vi.fn(async () => ({ overrides: { hardcover: { price: 31000 } }, registration: true, giftNote: false, seller: { legalName: "ИП MyBooks", bin: "123", phone: "+77010000000", whatsapp: "77010000000" } })),
}));
vi.mock("@/server/requisites", () => ({
  transferRequisites: vi.fn(async () => ({ phone: "+7 701 555 44 33", name: "ИП MyBooks" })),
  manualPaymentProps: vi.fn(async () => ({ title: "Kaspi перевод", steps: ["Переведите на +7 701 555 44 33"] })),
}));

// ADR 0013: веб ходит только в API v1 — в тестах его запросы обслуживает бэкенд на Nest в этом же процессе.
beforeEach(async () => {
  await routeWebToApi();
});

const { legacyAuth, nestApi, siteRouteMissing } = await import("./api");
const { HttpError } = await import("@/server/api");
const { OrderingError } = await import("@/modules/ordering/domain");

const GIFT_TOKEN = "Gift_token_abcdefghijklmn";
const ORDER_ID = "4a1b2c3d-1111-4222-8333-444444444444";
const INVITE_TOKEN = "invite_token_123";
const at = new Date("2026-11-20T10:00:00.000Z");

// Без входа: страницы раздела публичные.
const handleSiteRoute = await nestApi({
  auth: legacyAuth({
      user: async () => {
        throw new HttpError(401, "unauthorized");
      },
      staff: async () => {
        throw new HttpError(403, "forbidden");
      },
  }),
});

function makeApiClient() {
  const app = handleSiteRoute;
  const fetchViaApp: typeof fetch = (input, init) => app(new Request(String(input), init));
  return { app, client: createWebApiClient({ baseUrl: "http://127.0.0.1:3044", locale: "ru", fetch: fetchViaApp }) };
}

const strict = <T>(name: string, local: () => Promise<T>, viaApi: Parameters<typeof v1WebRead<T>>[0]["viaApi"]) =>
  v1WebRead({ name, section: "public", flag: "public", parity: "strict", client: makeApiClient().client, local, viaApi });

let gift: Record<string, unknown> | null;
let purchases: unknown[];
let claims: string[];
let unsubscribed: [string, string][];
let reviewState: unknown;

describe("архитектура моста Раздела 4 (public)", () => {
  it("v1-local-bridge-public.ts не импортирует container и модули статически", () => {
    const src = readFileSync(path.join(__dirname, "../../src/server/v1-local-bridge-public.ts"), "utf8");
    const statics = [...src.matchAll(/^import\s+(type\s+)?[^;]*?from\s+"([^"]+)"/gm)].filter((m) => !m[1]).map((m) => m[2]);
    expect(statics.filter((s) => /container|@\/modules\/|^pg$|drizzle/.test(s))).toEqual([]);
  });

  it("в контракте v1 нет двух маршрутов с одним методом и адресом", async () => {
    const { v1 } = await import("@mybook/contracts");
    const keys = Object.values(v1 as Record<string, { method: string; path: string }>).map((r) => `${r.method} ${r.path}`);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });

  it("бэкенд знает все публичные маршруты (оба префикса); /reviews/photo не путается с /reviews/{orderId}", () => {
    const paths = ["/api/gifts/{token}/pdf", "/api/letters/{token}", "/api/reviews/photo/{id}", "/api/reviews/{orderId}", "/api/chat/callback", "/api/chat", "/api/calendar/{token}", "/api/chat-avatar/{file}", "/api/r/{code}", "/api/go/{slug}"];
    expect(siteRouteMissing(handleSiteRoute, paths)).toEqual([]);
  });
});

describe("API v1 Раздел 4 (public): страницы без входа и strict parity", () => {
  beforeEach(() => {
    resetRequest();
    resetContainer();
    vi.stubEnv("DATABASE_URL", "postgres://test/mybook");
    vi.stubEnv("WEB_API_ONLY", "");
    vi.stubEnv("WEB_USE_API_V1", "");
    gift = {
      id: "9a1b2c3d-1111-4222-8333-444444444444",
      number: 17,
      token: GIFT_TOKEN,
      status: "paid",
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
      paymentClaimedAt: at,
      promo: { id: "promo-1", code: "GIFT-AAAA-BBBB", usedCount: 0, expiresAt: at },
    };
    purchases = [];
    claims = [];
    unsubscribed = [];
    reviewState = { order: { name: "Алия" }, review: { snapshot: () => ({ rating: 5, text: "Чудесно", authorName: "Алия", city: "Алматы", consent: true, photo: null, status: "new", thankYouCode: "THX-1" }) } };
    fake.rateLimiter = { hit: async () => true };
    fake.messaging = { widgetConfig: async () => ({ enabled: true, chat: false, whatsapp: "77010000000" }) };
    fake.marketing = { service: { shopWhatsapp: async () => "77015554433" } };
    fake.referrals = { service: { welcome: async (code: string) => (code === "ASEL-7K2Q" ? { code, percent: 10, from: "Асель" } : null) } };
    fake.feedback = {
      queries: {
        showcase: async () => [{ id: "r1", rating: 5, text: "Очень трогательно", authorName: "Дина", city: "Астана", theme: "mom", locale: "ru", photo: { width: 800, height: 600 }, publishedAt: at }],
        summary: async () => ({ average: 4.9, count: 12 }),
      },
      reviews: {
        open: async () => {
          if (reviewState instanceof Error) throw reviewState;
          return reviewState;
        },
      },
    };
    fake.authoring = {
      queries: {
        bookByInviteToken: async (t: string) =>
          t === INVITE_TOKEN ? { status: "draft", theme: "mom", title: "Мамина книга", authorName: "Алия", recipientName: "Мама", inviteText: "", coverTemplate: "linen", coverLines: true, format: "a5" } : undefined,
      },
    };
    fake.notifications = {
      subscriptions: {
        isValidLink: (u: string, t: string) => u === "u1" && t === "sig",
        unsubscribe: async (u: string, t: string) => {
          unsubscribed.push([u, t]);
          return true;
        },
      },
    };
    fake.ordering = {
      queries: {
        giftByToken: async (t: string) => (gift && t === GIFT_TOKEN ? gift : undefined),
        giftByPromo: async () => gift,
        orderDetails: async (id: string) =>
          id === ORDER_ID
            ? { number: 1042, book: { theme: "mom", title: "Наша история", coverTemplate: "linen", coverLines: true, format: "a5", authorName: "Алия", recipientName: "Мама", hideRecipientOnCover: false, namesOnCover: "" } }
            : undefined,
        ownedOrderDetails: async () => undefined,
      },
      promos: {
        check: async (code: string) =>
          code.toUpperCase() === "GIFT-AAAA-BBBB" ? { ok: true, promo: { id: "promo-1", code: "GIFT-AAAA-BBBB", kind: "fixed", value: 29000, label: "29 000 ₸" } } : { ok: false, error: "notFound" },
      },
      gifts: {
        purchase: async (cmd: Record<string, unknown>) => {
          purchases.push(cmd);
          if (cmd.sendAt === "2020-01-01") throw new OrderingError("giftPastDate");
          return { token: GIFT_TOKEN, amount: 29000 };
        },
        claimPayment: async (t: string) => {
          claims.push(t);
          return t === GIFT_TOKEN ? { token: GIFT_TOKEN } : null;
        },
      },
      kaspi: { available: async () => false, current: async () => null },
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("каталог, подвал, витрина отзывов и приглашение совпадают у local и API", async () => {
    const catalog = await strict("public.siteCatalog", () => localSiteCatalog(), (api) => api.webSiteCatalog({}));
    expect(catalog).toMatchObject({ registration: true, giftNote: false, overrides: { hardcover: { price: 31000 } } });

    const chrome = await strict("public.siteChrome", () => localSiteChrome(), (api) => api.webSiteChrome({}));
    expect(chrome).toEqual({ widget: { enabled: true, chat: false, whatsapp: "77010000000" }, shopWhatsappDigits: "77015554433" });

    const showcase = await strict("public.reviewsShowcase", () => localReviewsShowcase(6, "mom"), (api) => api.webReviewsShowcase({ limit: 6, theme: "mom" }));
    expect(showcase.reviews[0]).toMatchObject({ id: "r1", publishedAt: at.toISOString() });
    expect(showcase.summary).toEqual({ count: 12, average: 4.9 });

    const invite = await strict("public.inviteWelcome", () => localInviteWelcome("ASEL-7K2Q"), (api) => api.webInviteWelcome({ code: "ASEL-7K2Q" }));
    expect(invite.welcome).toEqual({ code: "ASEL-7K2Q", percent: 10, from: "Асель" });
    expect((await localInviteWelcome("bad code!")).welcome).toBeNull();
  });

  it("сертификат: оплаченный — код и ссылка активации на языке сертификата; ожидающий — способы оплаты; чужой — 404", async () => {
    const m = messagesFor("ru");
    const paid = await strict("public.giftStatus", () => localGiftStatus(GIFT_TOKEN, m), (api) => api.webGiftStatus({ token: GIFT_TOKEN, locale: "ru" }));
    expect(paid).toMatchObject({ number: 17, status: "paid", promo: { code: "GIFT-AAAA-BBBB", expiresAt: at.toISOString() }, payment: null });
    expect(paid!.redeemUrl).toContain("/kk/redeem?code=GIFT-AAAA-BBBB");

    gift = { ...gift!, status: "pending_payment", promo: null };
    const pending = await strict("public.giftStatus", () => localGiftStatus(GIFT_TOKEN, m), (api) => api.webGiftStatus({ token: GIFT_TOKEN, locale: "ru" }));
    expect(pending).toMatchObject({ promo: null, redeemUrl: null, payment: { manual: { title: "Kaspi перевод" }, kaspi: null } });

    expect(await localGiftStatus("unknown_token_xxxxxxxxxx", m)).toBeNull();
    const res = await makeApiClient().app(new Request(`http://127.0.0.1:3044/api/v1/web/gifts/unknown_token_xxxxxxxxxx`));
    expect(res.status).toBe(404);
  });

  it("покупка и «Я оплатил(а)» за сертификат: API и local дают одно, лимит — 429 в API", async () => {
    const body = { plan: "hardcover" as const, buyerName: "Асель", buyerEmail: "asel@mybooks.kz", buyerPhone: "", recipientName: "Мама", recipientEmail: null, sendAt: null, message: "", locale: "ru" as const, buyerLocale: "ru" as const };
    const { client, app } = makeApiClient();
    expect(await client.webGiftCreate({ body })).toEqual({ ok: true, token: GIFT_TOKEN, amount: 29000 });
    expect(await localGiftCreate(body, null)).toEqual({ ok: true, token: GIFT_TOKEN, amount: 29000 });
    expect(await localGiftCreate({ ...body, sendAt: "2020-01-01" }, null)).toEqual({ ok: false, error: "giftPastDate" });
    expect(purchases).toHaveLength(3);

    expect(await client.webGiftClaim({ body: { token: GIFT_TOKEN } })).toEqual({ token: GIFT_TOKEN });
    expect(await localGiftClaim("bad")).toEqual({ token: null });
    expect(claims).toEqual([GIFT_TOKEN]);

    fake.rateLimiter = { hit: async () => false };
    const limited = await app(new Request("http://127.0.0.1:3044/api/v1/web/gifts/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: GIFT_TOKEN }) }));
    expect(limited.status).toBe(429);
    expect(claims).toEqual([GIFT_TOKEN]);
  });

  it("активация кода, приглашение написать письмо, отзыв по ссылке и отписка — strict parity", async () => {
    const redeem = await strict("public.redeemCheck", () => localRedeemCheck("gift-aaaa-bbbb"), (api) => api.webRedeemCheck({ code: "gift-aaaa-bbbb" }));
    expect(redeem).toMatchObject({ check: { ok: true, code: "GIFT-AAAA-BBBB" }, gift: { recipientName: "Мама", locale: "kk" } });
    const wrong = await strict("public.redeemCheck", () => localRedeemCheck("nope"), (api) => api.webRedeemCheck({ code: "nope" }));
    expect(wrong).toEqual({ check: { ok: false, error: "notFound" }, gift: null });

    const letter = await strict("public.letterInvite", () => localLetterInvite(INVITE_TOKEN), (api) => api.webLetterInvite({ token: INVITE_TOKEN }));
    expect(letter).toMatchObject({ status: "draft", title: "Мамина книга" });
    expect(await localLetterInvite("short")).toBeNull();

    // Без подписи и без входа — отзыва нет (404), владелец заказа не найден.
    expect(await localReviewPage(ORDER_ID, null)).toBeNull();
    const { reviewUrl } = await import("@/modules/feedback");
    const t = new URL(reviewUrl(ORDER_ID, "ru")).searchParams.get("t")!;
    const page = await strict("public.reviewPage", () => localReviewPage(ORDER_ID, t), (api) => api.webReviewPage({ orderId: ORDER_ID, t }));
    expect(page).toMatchObject({ number: 1042, state: { defaultName: "Алия", review: { rating: 5, status: "new", hasPhoto: false } } });
    const { FeedbackError } = await import("@/modules/feedback");
    reviewState = new FeedbackError("reviewNotAllowed");
    expect((await localReviewPage(ORDER_ID, t))!.state).toBeNull();

    const link = await strict("public.unsubscribeLink", () => localUnsubscribeLink("u1", "sig"), (api) => api.webUnsubscribeLink({ u: "u1", t: "sig" }));
    expect(link).toEqual({ valid: true });
    await v1WebAction({ section: "public", flag: "public", client: makeApiClient().client, viaApi: (api) => api.webUnsubscribe({ body: { u: "u1", t: "sig" } }), local: () => localUnsubscribe("u1", "sig") });
    expect(await localUnsubscribe("u1", "sig")).toEqual({ ok: true });
    expect(unsubscribed).toEqual([
      ["u1", "sig"],
      ["u1", "sig"],
    ]);
  });
});

describe("публичные API-маршруты через v1SiteProxy и API", () => {
  beforeEach(() => {
    resetRequest();
    resetContainer();
    vi.stubEnv("DATABASE_URL", "postgres://test/mybook");
    vi.stubEnv("WEB_USE_API_V1", "");
    fake.rateLimiter = { hit: async () => true };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("чат сайта: новому посетителю cookie ставится в самом ответе (работает и в API на Nest)", async () => {
    const posts: unknown[] = [];
    fake.messaging = { widgetConfig: async () => ({ enabled: true, chat: true, whatsapp: "" }), site: { post: async (p: unknown) => void posts.push(p) } };
    const res = await handleSiteRoute(
      new Request("http://127.0.0.1:3044/api/v1/site/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "Здравствуйте" }) }),
    );
    expect(res!.status).toBe(200);
    expect(res!.headers.get("set-cookie")).toMatch(/httpOnly/i);
    expect(posts).toHaveLength(1);
  });

  it("ссылка-приглашение /r/<код>: cookie из заголовка, казахская главная по x-mb-locale", async () => {
    fake.referrals = { service: { welcome: async (code: string) => ({ code, percent: 10, from: "Асель" }) } };
    const res = await handleSiteRoute(new Request("http://127.0.0.1:3044/api/v1/site/r/ASEL-7K2Q", { headers: { "x-mb-locale": "kk", cookie: "mb_src=x" } }));
    expect(res!.status).toBe(302);
    expect(res!.headers.get("location")).toContain("/kk");
    const cookies = res!.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("mb_invite=ASEL-7K2Q"))).toBe(true);
  });

  it("при включённом разделе public маршрут уходит в API потоком, иначе работает на месте", async () => {
    const seen: string[] = [];
    const fetchSpy: typeof fetch = async (input) => {
      seen.push(String(input));
      return new Response("ok");
    };
    const local = vi.fn(async () => new Response("local"));
    expect(await (await v1SiteProxy("public", new Request("http://mybooks.kz/go/insta"), local, { flag: "", fetch: fetchSpy })).text()).toBe("local");
    await v1SiteProxy("public", new Request("http://mybooks.kz/go/insta"), local, { flag: "public", fetch: fetchSpy, baseUrl: "http://127.0.0.1:3044" });
    expect(seen).toEqual(["http://127.0.0.1:3044/api/v1/site/go/insta"]);
    void signIn;
    void owner;
  });
});
