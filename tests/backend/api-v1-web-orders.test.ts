import { legacyAuth, nestApi, routeWebToApi, siteRouteMissing } from "./api";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messagesFor } from "@/i18n/messages";
import type { BookRow } from "@/modules/authoring";
import { DealInvoice, OrderingError, PaymentInvoice } from "@/modules/ordering/domain";
import { createWebApiClient, v1WebAction, v1WebRead } from "@/server/v1-web-client";
import { v1SiteProxy } from "@/server/v1-proxy";
import {
  localCancelOrder,
  localCheckPromo,
  localCheckoutPageDto,
  localClaimOrderPayment,
  localOrderDetailDto,
  localOrdersListDto,
  localPayPageDto,
  localPayViewed,
} from "@/server/v1-local-bridge-orders";
import { client, egor, fake, owner, resetContainer, resetRequest, signIn } from "../doubles/web";

vi.mock("@/shared/infrastructure/http/request", async (real) => ({ ...(await real<object>()), ...(await import("../doubles/web")).nextHeaders, ...(await import("../doubles/web")).nextNavigation }));
vi.mock("@/server/container", async () => (await import("../doubles/web")).containerModule);
vi.mock("@/server/catalog", () => ({ ensureCatalog: vi.fn(async () => {}), syncCatalogFromSettings: vi.fn(async () => {}) }));
vi.mock("@/server/requisites", () => ({
  transferRequisites: vi.fn(async () => ({ phone: "+7 701 555 44 33", name: "ИП MyBooks" })),
  manualPaymentProps: vi.fn(async () => ({ title: "Kaspi перевод", steps: ["Переведите на +7 701 555 44 33"] })),
}));

// ADR 0013: веб ходит только в API v1 — в тестах его запросы обслуживает бэкенд на Nest в этом же процессе.
beforeEach(async () => {
  await routeWebToApi();
});

const { HttpError } = await import("@/server/api");

const USER_ID = "11111111-2222-4333-8444-555555555555";
const OTHER_USER_ID = "22222222-3333-4444-8555-666666666666";
const BOOK_ID = "3f2b8c1e-7a4d-4e5f-9b6c-1d2e3f4a5b6c";
const ORDER_ID = "4a1b2c3d-1111-4222-8333-444444444444";
const UPGRADE_ORDER_ID = "5b2c3d4e-1111-4222-8333-555555555555";
const PHOTO_ID = "6c3d4e5f-1111-4222-8333-666666666666";
const DEAL_ID = "7d4e5f6a-1111-4222-8333-777777777777";
const INVOICE_ID = "8e5f6a7b-1111-4222-8333-888888888888";
const KASPI_ID = "9f6a7b8c-1111-4222-8333-999999999999";
const PAY_TOKEN_VALID = "A".repeat(43);

const ownerUser = {
  ...client,
  id: USER_ID,
  email: "owner@mybooks.kz",
  name: "Алия",
  phone: "+7 701 111 22 33",
  locale: "ru" as const,
};

const foreignUser = {
  ...client,
  id: OTHER_USER_ID,
  email: "other@mybooks.kz",
  name: "Марат",
  phone: "+7 701 222 33 44",
  locale: "ru" as const,
};

const staffOrdersUser = {
  ...owner,
  id: owner.id,
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
    coverPhotoId: PHOTO_ID,
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
    layoutRev: 1,
    paginationRev: 1,
    inviteToken: null,
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

function makeOrderRow(over: Record<string, unknown> = {}) {
  const book = makeBook({ status: "ordered" });
  return {
    id: ORDER_ID,
    userId: USER_ID,
    bookId: BOOK_ID,
    number: 1042,
    status: "pending_payment" as const,
    plan: "hardcover",
    quantity: 1,
    currency: "KZT",
    itemsAmount: 35000,
    discountAmount: 3500,
    addonsAmount: 3000,
    deliveryAmount: 2000,
    prepaidAmount: 5000,
    amount: 31500,
    promoCode: "LOVE10",
    addons: ["giftwrap"],
    deliveryMethod: "courier",
    deliveryCountry: null,
    postalCode: null,
    city: "Алматы",
    address: "ул. Абая, 10",
    contactName: "Алия",
    contactPhone: "+7 701 111 22 33",
    contactEmail: "owner@mybooks.kz",
    giftNote: "С любовью",
    desiredDate: "2027-06-15",
    surprise: true,
    customerComment: "Позвоните заранее",
    trackingNumber: null,
    paymentClaimedAt: null,
    createdAt: new Date("2026-11-20T12:00:00.000Z"),
    book,
    ...over,
  };
}

function makeDealInvoice(over: Partial<Parameters<typeof DealInvoice.restore>[1]> = {}) {
  return DealInvoice.restore(INVOICE_ID, {
    number: 55,
    gifts: ["giftwrap"],
    booksCount: 1,
    token: PAY_TOKEN_VALID,
    dealId: DEAL_ID,
    conversationId: null,
    phone: "+7 701 111 22 33",
    clientName: "Алия",
    locale: "ru",
    channel: "whatsapp",
    plan: "hardcover",
    agreedTotal: 35000,
    amount: 10000,
    purpose: "prepayment",
    status: "pending_payment",
    paidMethod: null,
    paidRef: null,
    paidAt: null,
    claimedAt: null,
    viewedAt: null,
    closedReason: null,
    expiresAt: new Date("2027-12-01T10:00:00.000Z"),
    issuedById: null,
    accessStatus: "none",
    accessUserId: null,
    accessMessageId: null,
    accessAttemptedAt: null,
    issueKey: null,
    createdAt: new Date("2026-11-25T10:00:00.000Z"),
    ...over,
  });
}

function makeKaspiPayment(target: { kind: "order" | "deal_invoice"; id: string }) {
  return PaymentInvoice.issue(
    KASPI_ID,
    {
      provider: "kaspi",
      target,
      method: "invoice",
      externalId: "ext-1",
      phone: "77011112233",
      amount: 10000,
      checkoutUrl: "https://kaspi.kz/pay/123",
      qrToken: null,
      expiresAt: new Date("2027-12-01T12:00:00.000Z"),
    },
    new Date("2026-11-25T10:00:00.000Z"),
  );
}

async function makeApiClientFor(who: typeof ownerUser | typeof foreignUser | typeof staffOrdersUser | null) {
  const app = await nestApi({
    auth: legacyAuth({
      user: async () => {
        if (!who) throw new HttpError(401, "unauthorized");
        return who as never;
      },
      staff: async () => {
        if (!who || who.role !== "admin") throw new HttpError(403, "forbidden");
        return who as never;
      },
    }),
  });
  const fetchViaApp: typeof fetch = (input, init) => app(new Request(String(input), init));
  return {
    app,
    fetchViaApp,
    client: createWebApiClient({ baseUrl: "http://127.0.0.1:3044", locale: "ru", fetch: fetchViaApp }),
  };
}

describe("архитектура моста и ленивых модулей Раздела 3 (orders)", () => {
  it("v1-local-bridge-orders.ts, checkout.ts и order-view.ts не имеют статических импортов container/pg/@/modules", () => {
    for (const rel of [
      "src/server/v1-local-bridge-orders.ts",
      "src/server/checkout.ts",
      "src/server/order-view.ts",
    ]) {
      const src = readFileSync(path.join(process.cwd(), rel), "utf8");
      const staticForbidden = [...src.matchAll(/^import\s+(?!type\b)[^;]*?\s+from\s+["']([^"']+)["']/gm)]
        .map((m) => m[1])
        .filter((s) => /^(\.\/container|@\/server\/container|@\/modules\/|pg$|drizzle-orm)/.test(s));
      expect(staticForbidden, rel).toEqual([]);
    }
  });
});

describe("API v1 Раздел 3 (web-orders): оформление, заказы, оплата и parity", () => {
  let book: BookRow;
  let orderRow: ReturnType<typeof makeOrderRow>;
  let dealInvoice: DealInvoice | null;
  let dealRow: { id: string; orderId: string | null } | null;
  let lastOrderOfBook: { id: string; status: string } | null;
  let agreement: Record<string, unknown> | null;
  let upgradeOffer: { bookId: string; orderId: string; number: number; credit: number } | null;
  let placeOrderResult: { id: string; amount: number } | Error;
  let placedCommands: unknown[];
  let viewedTokens: string[];
  let claimedTokens: string[];
  let claimedOrders: unknown[];
  let cancelledOrders: unknown[];

  beforeEach(() => {
    resetRequest();
    resetContainer();
    vi.stubEnv("DATABASE_URL", "postgres://test/mybook");
    vi.stubEnv("WEB_API_ONLY", "");
    vi.stubEnv("WEB_USE_API_V1", "");

    book = makeBook();
    orderRow = makeOrderRow();
    dealInvoice = makeDealInvoice();
    dealRow = { id: DEAL_ID, orderId: null };
    lastOrderOfBook = null;
    agreement = {
      dealId: DEAL_ID,
      dealNumber: 77,
      agreedTotal: 29000,
      prepaid: 5000,
      plan: "hardcover",
      gifts: ["giftwrap"],
      deadline: null,
      batch: { index: 0, size: 2, left: 2, agreedLeft: 58000, prepaidLeft: 10000 },
    };
    upgradeOffer = null;
    placeOrderResult = { id: ORDER_ID, amount: 31500 };
    placedCommands = [];
    viewedTokens = [];
    claimedTokens = [];
    claimedOrders = [];
    cancelledOrders = [];

    signIn(ownerUser);

    fake.authoring = {
      queries: {
        visibleBook: async (id: string, viewer: { userId: string; isStaff: boolean }) =>
          id === book.id && (viewer.userId === book.userId || viewer.isStaff) ? book : null,
        stats: async () => ({ answered: 12, total: 20, words: 1800, photos: 1, estimatedPages: 48, printedPages: 52, emptyChapters: 0 }),
        photos: async () => [{ id: PHOTO_ID, bookId: BOOK_ID, width: 1600, height: 1200, caption: "", layout: "full", questionId: null, chapter: null, opener: false, crop: null, storageKey: "p1", position: 0 }],
        questions: async () => [],
        chapters: async () => [],
        approvedLetters: async () => [],
        userBooks: async () => [{ book, answered: 12, total: 20, words: 1800, photos: 1 }],
      },
    };
    fake.previews = {
      current: async () => ({ pageCount: 56, contentPages: 52 }),
    };
    fake.ordering = {
      queries: {
        lastOrderOfBook: async () => lastOrderOfBook,
        giftByPromo: async () => ({ plan: "premium" }),
        userOrders: async () => [orderRow],
        orderDetails: async (id: string) => (id === orderRow.id ? orderRow : undefined),
      },
      orders: {
        agreementFor: async () => agreement,
        upgradeOffer: async () => upgradeOffer,
        place: async (cmd: unknown) => {
          placedCommands.push(cmd);
          if (placeOrderResult instanceof Error) throw placeOrderResult;
          return placeOrderResult;
        },
        claimPayment: async (...args: unknown[]) => {
          claimedOrders.push(args);
        },
        cancelByCustomer: async (...args: unknown[]) => {
          cancelledOrders.push(args);
        },
      },
      promos: {
        check: async (code: string) =>
          code.toUpperCase() === "GIFT-123"
            ? { ok: true, promo: { id: "promo-1", code: "GIFT-123", kind: "fixed", value: 15000, label: "15 000 ₸" } }
            : { ok: false, error: "notFound" },
      },
      kaspi: {
        available: async () => true,
        current: async (target: { kind: "order" | "deal_invoice"; id: string }) => makeKaspiPayment(target),
      },
      kaspiRecipient: async () => "ИП MyBooks",
      invoices: {
        byToken: async (t: string) => (dealInvoice && t === dealInvoice.token ? dealInvoice : null),
        viewed: async (t: string) => {
          viewedTokens.push(t);
          return true;
        },
        claim: async (t: string) => {
          claimedTokens.push(t);
          return dealInvoice && t === dealInvoice.token ? dealInvoice : null;
        },
      },
    };
    fake.feedback = {
      queries: {
        byOrder: async () => ({ rating: 5, status: "new", thankYouCode: "THX-10" }),
      },
    };
    fake.sales = {
      deals: {
        findById: async () => dealRow,
      },
    };
    fake.reporting = {
      orderOwnership: async () => ({ managerId: null, assigneeId: null }),
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("webCheckoutPage: strict parity local vs API v1 (промо, сертификат, договорённость, закрытая книга)", async () => {
    const { client: api } = await makeApiClientFor(ownerUser);
    const m = messagesFor("ru");

    const res = await v1WebRead({
      name: "orders.checkoutPage",
      section: "orders",
      locale: "ru",
      flag: "orders",
      parity: "strict",
      client: api,
      local: () => localCheckoutPageDto(book, ownerUser, "ru", m, { promo: "GIFT-123" }),
      viaApi: (c) => c.webCheckoutPage({ bookId: BOOK_ID, locale: "ru", promo: "GIFT-123" }),
    });

    expect(res.closed).toBe(false);
    expect(res.data).toMatchObject({
      pageCount: 56,
      exactPages: true,
      answered: 12,
      staffView: false,
      initialPlan: "premium",
      initialPromo: { ok: true, code: "GIFT-123", kind: "fixed", value: 15000 },
      agreement: { dealNumber: 77, agreedTotal: 29000, prepaid: 5000, plan: "hardcover", gifts: ["giftwrap"] },
    });

    // Книга уже заказана → closed: true (редирект на страницу книги).
    lastOrderOfBook = { id: ORDER_ID, status: "paid" };
    const closed = await v1WebRead({
      name: "orders.checkoutPage.closed",
      section: "orders",
      locale: "ru",
      flag: "orders",
      parity: "strict",
      client: api,
      local: () => localCheckoutPageDto(book, ownerUser, "ru", m),
      viaApi: (c) => c.webCheckoutPage({ bookId: BOOK_ID, locale: "ru" }),
    });
    expect(closed).toEqual({ closed: true, data: null });

    // Дозаказ печатной версии (?upgrade=...) открывает оформление для заказанной книги.
    book = makeBook({ status: "ordered" });
    upgradeOffer = { bookId: BOOK_ID, orderId: UPGRADE_ORDER_ID, number: 901, credit: 12000 };
    const upgraded = await v1WebRead({
      name: "orders.checkoutPage.upgrade",
      section: "orders",
      locale: "ru",
      flag: "orders",
      parity: "strict",
      client: api,
      local: () => localCheckoutPageDto(book, ownerUser, "ru", m, { upgrade: UPGRADE_ORDER_ID }),
      viaApi: (c) => c.webCheckoutPage({ bookId: BOOK_ID, locale: "ru", upgrade: UPGRADE_ORDER_ID }),
    });
    expect(upgraded.closed).toBe(false);
    expect(upgraded.data?.upgrade).toEqual({ orderId: UPGRADE_ORDER_ID, number: 901, credit: 12000 });
    expect(upgraded.data?.agreement).toBeNull();
  });

  it("webPromoCheck: проверка промокода, ошибка и лимит частоты", async () => {
    const { client: api } = await makeApiClientFor(ownerUser);
    const m = messagesFor("ru");

    const ok = await v1WebAction({
      section: "orders",
      flag: "orders",
      client: api,
      viaApi: (c) => c.webPromoCheck({ body: { code: "GIFT-123", locale: "ru" } }),
      local: () => localCheckPromo(ownerUser.id, "GIFT-123", m),
    });
    expect(ok).toEqual({ ok: true, code: "GIFT-123", kind: "fixed", value: 15000, label: "15 000 ₸" });

    const missing = await api.webPromoCheck({ body: { code: "BADCODE", locale: "ru" } });
    expect(missing).toEqual({ ok: false, error: m.checkout.promo.notFound });

    fake.rateLimiter = { hit: async () => false };
    const limited = await api.webPromoCheck({ body: { code: "GIFT-123", locale: "ru" } });
    expect(limited).toEqual({ ok: false, error: m.checkout.errors.tooMany });
  });

  it("webOrderPlace: оформление заказа через API v1 (успех, ошибка схемы и OrderingError)", async () => {
    const { client: api, app } = await makeApiClientFor(ownerUser);

    const placed = await api.webOrderPlace({
      body: {
        bookId: BOOK_ID,
        plan: "hardcover",
        quantity: 1,
        delivery: "courier",
        contactName: "Алия",
        contactPhone: "+7 701 111 22 33",
        contactEmail: "owner@mybooks.kz",
        city: "Алматы",
        address: "ул. Абая, 10",
        promoCode: "GIFT-123",
        addons: "giftwrap",
        agreementMode: "agreed",
        consent: true,
        locale: "ru",
      },
    });
    expect(placed).toEqual({ orderId: ORDER_ID, amount: 31500 });
    expect(placedCommands).toHaveLength(1);

    // Ошибка валидации (нет согласия) → 400.
    const badRes = await app(
      new Request("http://127.0.0.1:3044/api/v1/web/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bookId: BOOK_ID,
          plan: "hardcover",
          quantity: 1,
          delivery: "courier",
          contactName: "Алия",
          contactPhone: "+7 701 111 22 33",
          contactEmail: "owner@mybooks.kz",
          city: "Алматы",
          address: "ул. Абая, 10",
          consent: false,
          locale: "ru",
        }),
      }),
    );
    expect(badRes.status).toBe(400);

    // Доменная ошибка OrderingError → 400 с текстом домена.
    placeOrderResult = new OrderingError("alreadyOrdered");
    const errRes = await app(
      new Request("http://127.0.0.1:3044/api/v1/web/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bookId: BOOK_ID,
          plan: "hardcover",
          quantity: 1,
          delivery: "courier",
          contactName: "Алия",
          contactPhone: "+7 701 111 22 33",
          contactEmail: "owner@mybooks.kz",
          city: "Алматы",
          address: "ул. Абая, 10",
          consent: true,
          locale: "ru",
        }),
      }),
    );
    expect(errRes.status).toBe(400);
    expect((await errRes.json()).code).toBe("alreadyOrdered");
  });

  it("webOrdersList: strict parity local vs API v1 (заказы + договорённость + книги брони)", async () => {
    const { client: api } = await makeApiClientFor(ownerUser);

    const res = await v1WebRead({
      name: "orders.list",
      section: "orders",
      locale: "ru",
      flag: "orders",
      parity: "strict",
      client: api,
      local: () => localOrdersListDto(ownerUser.id, "ru"),
      viaApi: (c) => c.webOrdersList({ locale: "ru" }),
    });

    expect(res.orders).toHaveLength(1);
    expect(res.orders[0]).toMatchObject({
      id: ORDER_ID,
      number: 1042,
      printed: true,
      amount: 31500,
      status: "pending_payment",
      statusTone: "warning",
      book: { id: BOOK_ID, title: "Наша история" },
    });
    expect(res.agreement).toMatchObject({ dealNumber: 77, agreedTotal: 29000, prepaid: 5000 });
    expect(res.agreementBooks).toHaveLength(1);
  });

  it("webOrderDetail: strict parity для владельца, доступ сотрудника с orders.view и 404 для чужого", async () => {
    const { client: api } = await makeApiClientFor(ownerUser);
    const m = messagesFor("ru");

    const ownDetail = await v1WebRead({
      name: "orders.detail.own",
      section: "orders",
      locale: "ru",
      flag: "orders",
      parity: "strict",
      client: api,
      local: () => localOrderDetailDto(ORDER_ID, ownerUser, "ru", m),
      viaApi: (c) => c.webOrderDetail({ orderId: ORDER_ID, locale: "ru" }),
    });
    expect(ownDetail).not.toBeNull();
    expect(ownDetail!.own).toBe(true);
    expect(ownDetail!.payment?.kaspi?.initial?.id).toBe(KASPI_ID);
    expect(ownDetail!.payment?.manual?.title).toBe("Kaspi перевод");
    expect(ownDetail!.reviewThankYouPercent).toBeGreaterThan(0);
    expect(ownDetail!.referral.friendPercent).toBeGreaterThan(0);

    // Чужой обычный клиент получает 404.
    signIn(foreignUser);
    const { app: foreignApp } = await makeApiClientFor(foreignUser);
    const foreignRes = await foreignApp(new Request(`http://127.0.0.1:3044/api/v1/web/orders/${ORDER_ID}?locale=ru`));
    expect(foreignRes.status).toBe(404);

    // Сотрудник с orders.view видит чужой заказ (own: false, без блока оплаты клиента).
    signIn(staffOrdersUser);
    const { client: staffApi } = await makeApiClientFor(staffOrdersUser);
    const staffDetail = await staffApi.webOrderDetail({ orderId: ORDER_ID, locale: "ru" });
    expect(staffDetail.own).toBe(false);
    expect(staffDetail.payment).toBeNull();
    expect(staffDetail.order.id).toBe(ORDER_ID);

    // Сотрудник без orders.view (egor) — 404.
    signIn(egor);
    const { app: egorApp } = await makeApiClientFor(egor as never);
    expect((await egorApp(new Request(`http://127.0.0.1:3044/api/v1/web/orders/${ORDER_ID}`))).status).toBe(404);
  });

  it("cabinetOrderClaim / cabinetOrderCancel через v1WebAction (как orders/actions.ts)", async () => {
    const { client: api } = await makeApiClientFor(ownerUser);

    await v1WebAction({
      section: "orders",
      flag: "orders",
      client: api,
      viaApi: (c) => c.cabinetOrderClaim({ orderId: ORDER_ID }),
      local: () => localClaimOrderPayment(ORDER_ID, ownerUser.id),
    });
    await v1WebAction({
      section: "orders",
      flag: "orders",
      client: api,
      viaApi: (c) => c.cabinetOrderCancel({ orderId: ORDER_ID }),
      local: () => localCancelOrder(ORDER_ID, ownerUser.id),
    });
    expect(claimedOrders).toEqual([[ORDER_ID, ownerUser.id]]);
    expect(cancelledOrders).toEqual([[ORDER_ID, ownerUser.id]]);
  });

  it("webPayPage, webPayViewed, webPayClaim: оплата по токену без входа, маска номера, лимит и parity", async () => {
    resetRequest();
    const { client: anonApi, app: anonApp } = await makeApiClientFor(null);

    const pay = await v1WebRead({
      name: "orders.payPage",
      section: "orders",
      locale: "ru",
      flag: "orders",
      parity: "strict",
      client: anonApi,
      local: () => localPayPageDto(PAY_TOKEN_VALID),
      viaApi: (c) => c.webPayPage({ token: PAY_TOKEN_VALID, locale: "ru" }),
    });
    expect(pay).not.toBeNull();
    expect(pay!.state).toBe("payable");
    expect(pay!.label).toBe("P55");
    expect(pay!.kaspi?.comment).toBe("MyBooks P55");
    expect(pay!.kaspi?.maskedPhone).toBe("+7 701 ••• •• 33");
    expect(pay!.kaspi?.initial?.phone).toBe("+7 701 ••• •• 33");
    expect(pay!.transfer).toEqual({ phone: "+7 701 555 44 33", name: "ИП MyBooks" });

    // Невалидный токен → 404.
    expect((await anonApp(new Request("http://127.0.0.1:3044/api/v1/web/pay/bad-token"))).status).toBe(404);

    // Клиент открыл счёт → viewed(token) вызывается; сотрудник (admin) → пропускается.
    await v1WebAction({
      section: "orders",
      flag: "orders",
      client: anonApi,
      viaApi: (c) => c.webPayViewed({ token: PAY_TOKEN_VALID }),
      local: () => localPayViewed(PAY_TOKEN_VALID),
    });
    expect(viewedTokens).toEqual([PAY_TOKEN_VALID]);

    // Сотрудник открыл ту же ссылку из CRM со своей сессией (вход — по сессиям двойника container()).
    signIn(owner);
    const staffApp = await nestApi();
    const staffApi = createWebApiClient({ baseUrl: "http://127.0.0.1:3044", locale: "ru", sessionCookie: owner.id, fetch: (input, init) => staffApp(new Request(String(input), init)) });
    await staffApi.webPayViewed({ token: PAY_TOKEN_VALID });
    expect(viewedTokens).toEqual([PAY_TOKEN_VALID]);

    // «Я оплатил(а)» по счёту из чата: валидный, мусорный и rate-limit 429.
    resetRequest();
    expect(await anonApi.webPayClaim({ body: { token: PAY_TOKEN_VALID, locale: "ru" } })).toEqual({ claimed: true, token: PAY_TOKEN_VALID });
    expect(claimedTokens).toEqual([PAY_TOKEN_VALID]);

    expect(await anonApi.webPayClaim({ body: { token: "short", locale: "ru" } })).toEqual({ claimed: false, token: null });
    expect(claimedTokens).toEqual([PAY_TOKEN_VALID]);

    fake.rateLimiter = { hit: async () => false };
    const limitedRes = await anonApp(
      new Request("http://127.0.0.1:3044/api/v1/web/pay/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: PAY_TOKEN_VALID, locale: "ru" }),
      }),
    );
    expect(limitedRes.status).toBe(429);
  });
});

describe("потоковые API-маршруты заказов и оплат (v1SiteProxy + site-routes)", () => {
  beforeEach(() => {
    resetRequest();
    resetContainer();
    vi.stubEnv("DATABASE_URL", "postgres://test/mybook");
    vi.stubEnv("WEB_API_ONLY", "");
    vi.stubEnv("WEB_USE_API_V1", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("бэкенд знает все 6 маршрутов заказов и оплат (оба префикса; статика /invoices и /invoices/{id} не путаются)", async () => {
    const { app } = await makeApiClientFor(null);
    const paths = [
      "/api/orders/{id}/files/{kind}",
      "/api/orders/{id}/render-progress",
      "/api/payments/kaspi/invoices",
      "/api/payments/kaspi/invoices/{id}",
      "/api/payments/kaspi/webhook",
      "/api/payments/cloudpayments/{event}",
    ];
    expect(siteRouteMissing(app, paths)).toEqual([]);
  });

  it("скачивание PDF заказа проксируется строго потоком (без arrayBuffer) с пробросом Range и Content-Disposition", async () => {
    const pdfChunks = [new TextEncoder().encode("%PDF-1.7\n"), new TextEncoder().encode("stream-body")];
    const upstreamStream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of pdfChunks) controller.enqueue(chunk);
        controller.close();
      },
    });

    let seenUrl = "";
    let seenHeaders: Headers | null = null;
    const fakeFetch: typeof fetch = async (input, init) => {
      seenUrl = String(input);
      seenHeaders = new Headers(init?.headers);
      return new Response(upstreamStream, {
        status: 206,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="mybook-1042.pdf"',
          "content-range": "bytes 0-19/100",
          "cache-control": "private, no-store",
        },
      });
    };

    const req = new Request(`https://preview.vercel.app/api/orders/${ORDER_ID}/files/reading`, {
      method: "GET",
      headers: {
        cookie: "mb_session=tok_pdf_123",
        range: "bytes=0-19",
        "x-real-ip": "91.201.214.10",
      },
    });
    const res = await v1SiteProxy("orders", req, async () => Response.json({ local: true }), {
      baseUrl: "http://127.0.0.1:3044",
      fetch: fakeFetch,
      flag: "orders",
    });

    expect(seenUrl).toBe(`http://127.0.0.1:3044/api/v1/site/orders/${ORDER_ID}/files/reading`);
    expect(seenHeaders!.get("range")).toBe("bytes=0-19");
    expect(seenHeaders!.get("authorization")).toBe("Bearer tok_pdf_123");
    expect(seenHeaders!.get("x-real-ip")).toBe("91.201.214.10");
    expect(res.status).toBe(206);
    expect(res.body).toBe(upstreamStream);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="mybook-1042.pdf"');
    expect(await res.text()).toBe("%PDF-1.7\nstream-body");
  });

  it("render-progress и Kaspi-счёта проксируются через /api/v1/site/... и обрабатываются бэкендом", async () => {
    const handleSiteRoute = await routeWebToApi();
    signIn(ownerUser);
    fake.ordering = {
      queries: {
        orderDetails: async () => makeOrderRow(),
      },
      kaspi: {
        status: async () => makeKaspiPayment({ kind: "deal_invoice", id: INVOICE_ID }),
      },
    };
    fake.renderProgress = {
      forOrder: () => [{ kind: "reading", percent: 75, stage: "pdf" }],
    };

    const progressRes = await handleSiteRoute(new Request(`http://127.0.0.1:3044/api/v1/site/orders/${ORDER_ID}/render-progress`, { headers: { cookie: `mb_session=${ownerUser.id}` } }));
    expect(progressRes?.status).toBe(200);
    expect(await progressRes!.json()).toEqual({ jobs: [{ kind: "reading", percent: 75, stage: "pdf" }] });

    resetRequest();
    const kaspiRes = await handleSiteRoute(
      new Request(`http://127.0.0.1:3044/api/v1/site/payments/kaspi/invoices/${KASPI_ID}?pay=${PAY_TOKEN_VALID}`),
    );
    expect(kaspiRes?.status).toBe(200);
    expect((await kaspiRes!.json()).invoice).toMatchObject({ id: KASPI_ID, phone: "+7 701 ••• •• 33" });
  });

  it("вебхуки Kaspi и CloudPayments сохраняют заголовки подписи при проксировании через v1SiteProxy", async () => {
    const seen: { url: string; sig: string | null; hmac: string | null }[] = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const h = new Headers(init?.headers);
      seen.push({
        url: String(input),
        sig: h.get("x-webhook-signature"),
        hmac: h.get("content-hmac"),
      });
      return Response.json({ ok: true });
    };

    await v1SiteProxy(
      "orders",
      new Request("https://mybooks.kz/api/payments/kaspi/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "x-webhook-signature": "sig-kaspi-1" },
        body: JSON.stringify({ event: "payment.success" }),
      }),
      async () => Response.json({ local: true }),
      { baseUrl: "http://127.0.0.1:3044", fetch: fakeFetch, flag: "orders" },
    );

    await v1SiteProxy(
      "orders",
      new Request("https://mybooks.kz/api/payments/cloudpayments/pay", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "content-hmac": "hmac-cp-1" },
        body: "InvoiceId=1042",
      }),
      async () => Response.json({ local: true }),
      { baseUrl: "http://127.0.0.1:3044", fetch: fakeFetch, flag: "orders" },
    );

    expect(seen).toEqual([
      { url: "http://127.0.0.1:3044/api/v1/site/payments/kaspi/webhook", sig: "sig-kaspi-1", hmac: null },
      { url: "http://127.0.0.1:3044/api/v1/site/payments/cloudpayments/pay", sig: null, hmac: "hmac-cp-1" },
    ]);
  });
});
