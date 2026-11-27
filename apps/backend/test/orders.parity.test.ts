import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { v1 } from "@mybook/contracts";
import { StaffContext } from "@/modules/access/domain/StaffContext";
import type { BookRow, BookViewer } from "@/modules/authoring";
import { isPhoneEmail } from "@/modules/identity";
import { allPermissions, type Permission } from "@/shared/domain/permissions";
import { STAFF_ACCESS, type StaffAccessPort } from "../src/core/auth/staff";
import { CABINET_BOOK_PORTS } from "../src/modules/identity/identity.tokens";
import { ORDERS_API_PORTS, type OrdersApiRoute } from "../src/modules/orders/orders.tokens";
import { bootTestApp, sessionOf, testUser } from "./app";

/**
 * Контекст 7A («заказы и деньги API v1»): все 47 маршрутов байт в байт у Nest и mybook-api — без входа, клиентом,
 * сотрудником без прав и с успешным ответом. Обе стороны зовут один общий код (src/server/api-v1/orders.ts), поэтому
 * тест сверяет то, что у процессов своё: вход, права, книгу, разбор входа, ответ (ETag/304, no-store), ошибки.
 */
const OWNER = testUser("11111111-1111-4111-8111-111111111111", { name: "Айгерим", email: "owner@mybooks.kz", role: "admin" });
const SALES = testUser("22222222-2222-4222-8222-222222222222", { name: "Данияр", email: "sales@mybooks.kz", role: "admin" });
const NO_PERMS = testUser("44444444-4444-4444-8444-444444444444", { name: "Стажёр", email: "intern@mybooks.kz", role: "admin" });
const CLIENT = testUser("88888888-8888-4888-8888-888888888888", { name: "Асель", email: "asel@example.kz", role: "user" });
const OTHER = testUser("99999999-9999-4999-8999-999999999990", { name: "Чужой", email: "other@example.kz", role: "user" });
const ALL_USERS = [OWNER, SALES, NO_PERMS, CLIENT, OTHER];

const BOOK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORDER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PAYMENT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const INVOICE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const EXPENSE_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const RESOLUTION_ID = "abababab-abab-4bab-8bab-abababababab";
const DEAL_ID = "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd";
const PAID_AT = new Date("2026-11-25T08:00:00.000Z");

const makeCtx = (id: string, roleName: string, scope: "all" | "own", perms: readonly Permission[], isOwner = false) =>
  new StaffContext(id, roleName, isOwner ? "owner" : null, scope, new Set(perms), isOwner, { isPhoneEmail });

function resolveStaffSync(user: { id: string; role: string; staffDisabled?: boolean | null }) {
  if (user.role !== "admin" || user.staffDisabled) return null;
  if (user.id === OWNER.id) return makeCtx(user.id, "Руководитель", "all", allPermissions, true);
  if (user.id === SALES.id) return makeCtx(user.id, "Менеджер", "own", ["orders.view", "analytics.view", "chats.send"]);
  if (user.id === NO_PERMS.id) return makeCtx(user.id, "Стажёр", "own", []);
  return null;
}

const staffAccess: StaffAccessPort = {
  async resolve(user) {
    const context = resolveStaffSync(user);
    return context ? { context, gate: null } : null;
  },
};

const shared = vi.hoisted(() => ({ refuse: null as string | null, allowRate: true, viewed: 0, layoutRefusal: null as "layoutBookEditing" | "layoutNotApproved" | "layoutNotNeeded" | null }));

/** Ответ-заглушка по схеме контракта маршрута: проходит проверку ответа у обоих процессов. */
const sample = async (route: string) => {
  const [{ v1: routes }, { sampleOf }] = await Promise.all([import("@mybook/contracts"), import("./zod-sample")]);
  return sampleOf((routes as unknown as Record<string, { response: import("zod").ZodType }>)[route].response) as Record<string, unknown>;
};

const sampleBook = { id: BOOK_ID, userId: "88888888-8888-4888-8888-888888888888", title: "Мама", status: "draft", language: "ru" } as unknown as BookRow;

const orderRow = {
  id: ORDER_ID,
  number: 1042,
  userId: "88888888-8888-4888-8888-888888888888",
  status: "paid",
  plan: "hardcover",
  amount: 29000,
  receivedAmount: 29000,
  paidAt: PAID_AT,
  postpay: false,
  trackingNumber: null,
  discountAmount: 0,
  promoCode: null,
  itemsAmount: 29000,
  printSpec: null,
  // Печатный заказ ждёт согласования макета клиентом: crmOrderFiles показывает, почему файлы закрыты.
  layoutApprovalRequired: true,
  layoutApprovedAt: null,
  layoutApprovedFingerprint: null,
  layoutApprovalRevokedAt: null,
  book: { id: BOOK_ID, status: "ordered" },
  contactName: "Асель",
  contactPhone: "+77011234567",
  contactEmail: "asel@example.kz",
  deliveryMethod: "courier",
  deliveryCountry: "KZ",
  city: "Алматы",
  address: "Абая 1",
  postalCode: null,
  desiredDate: null,
  giftNote: null,
  adminNote: "",
};

const noCounts = { leads: 0, buyers: 0, buyersFirstSum: 0, buyersAgreed: 0, orders: 0, books: 0 };

const mockContainer = {
  authoring: { queries: { visibleBook: async (bookId: string, viewer: BookViewer) => (bookId === BOOK_ID && (viewer.isStaff || viewer.userId === CLIENT.id) ? sampleBook : null) } },
  ordering: {
    queries: { orderDetails: async (id: string) => (id === ORDER_ID ? orderRow : null) },
    payments: {
      list: async () => [{ id: PAYMENT_ID, kind: "payment", amount: 29000, method: "kaspi", paidAt: PAID_AT, note: "", receipt: null, payForm: null, createdById: OWNER.id, reviewedAt: null, reviewedById: null, voidedAt: null, voidReason: null }],
    },
    kaspi: {
      payOrder: async () => ({ id: INVOICE_ID }),
      status: async () => ({ id: INVOICE_ID }),
    },
    orders: {
      claimPayment: async () => {},
      cancelByCustomer: async () => {},
      currentLayout: async () => ({ fingerprint: "fp-approved", bookOpen: false }),
      // Согласование макета: только свой заказ (чужой — как будто его нет); отказ домена — shared.layoutRefusal.
      approveLayout: async (orderId: string, userId: string) => {
        const { OrderingError } = await import("@/modules/ordering/domain/errors");
        if (orderId !== ORDER_ID || userId !== CLIENT.id) throw new OrderingError("orderNotFound");
        if (shared.layoutRefusal) throw new OrderingError(shared.layoutRefusal);
        return { bookId: BOOK_ID, layoutApproval: { required: true, approvedAt: PAID_AT, fingerprint: "fp-approved", revokedAt: null } };
      },
    },
  },
  access: { queries: { allStaff: async () => [{ id: OWNER.id, name: "Айгерим", email: "owner@mybooks.kz" }] } },
  reporting: {
    finance: async () => ({ money: [], deals: [], orders: [], unrecorded: [], review: [], resolutions: [] }),
    expenses: async () => [],
    profit: async () => ({ money: [], expenses: [], counts: noCounts, prevCounts: noCounts, forms: {} }),
    orderCrm: async () => ({ deal: { id: DEAL_ID, number: 42, conversationId: null } }),
  },
};

vi.mock("next/headers", () => import("../../../apps/api/src/http/next-shim"));
vi.mock("next/server", () => import("../../../apps/api/src/http/next-shim"));
vi.mock("next/navigation", () => import("../../../apps/api/src/http/next-shim"));
vi.mock("@/server/container", () => ({ container: () => mockContainer }));
vi.mock("@/server/rateLimit", () => ({ rateLimit: async () => shared.allowRate, trustedClientIp: async () => "203.0.113.10" }));
vi.mock("@/server/auth", async () => {
  const shim = await import("../../../apps/api/src/http/next-shim");
  const token = async () => {
    const jar = await shim.cookies();
    const hdrs = await shim.headers();
    return jar.get("mb_session")?.value ?? hdrs.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{20,200})$/)?.[1] ?? null;
  };
  return {
    sessionToken: token,
    getCurrentUser: async () => {
      const tok = await token();
      return tok ? (ALL_USERS.find((u) => sessionOf(u) === tok) ?? null) : null;
    },
  };
});
vi.mock("@/server/access", async (orig) => {
  const actual = await orig<typeof import("@/server/access")>();
  const { getCurrentUser } = await import("@/server/auth");
  return {
    ...actual,
    getStaff: async () => {
      const u = await getCurrentUser();
      const context = u ? resolveStaffSync(u) : null;
      if (!u || !context) return null;
      return { user: u, roleName: context.roleName, roleKey: context.roleKey, scope: context.scope, permissions: context.permissions, isOwner: context.isOwner, context };
    },
    canSeeOrder: async (staff: { context: StaffContext }) => staff.context.scope === "all",
    audit: async () => {},
  };
});
vi.mock("@/server/checkout", async (orig) => ({
  ...(await orig<typeof import("@/server/checkout")>()),
  checkoutModel: () => sample("cabinetCheckout"),
  checkoutQuote: () => sample("cabinetCheckoutQuote"),
  placeOrder: async () => ({ id: ORDER_ID }),
}));
vi.mock("@/server/order-view", () => ({
  orderModel: () => sample("cabinetOrder"),
  ordersList: () => sample("cabinetOrders"),
  kaspiInvoice: (v: unknown) => v,
}));
vi.mock("@/server/kaspi-view", () => ({ invoiceView: async () => (await sample("cabinetOrderKaspiStatus")).invoice }));
vi.mock("@/server/v1-local-bridge-orders", () => ({
  localCheckoutPageDto: () => sample("webCheckoutPage"),
  localCheckPromo: () => sample("webPromoCheck"),
  localOrderDetailDto: async (id: string) => (id === ORDER_ID ? sample("webOrderDetail") : null),
  localOrdersListDto: () => sample("webOrdersList"),
  localPayClaim: async () => ({ claimed: true, token: "pay-token" }),
  localPayPageDto: async (token: string) => (token === "pay-token" ? sample("webPayPage") : null),
  localPayViewed: async () => {
    shared.viewed += 1;
    return { ok: true };
  },
  localPlaceOrder: async () => (shared.refuse ? { ok: false, error: shared.refuse, code: "refused" } : { ok: true, orderId: ORDER_ID, amount: 29000 }),
}));
vi.mock("@/server/discount", () => ({ discountLimit: async () => 15 }));
vi.mock("@/server/pay-form", () => ({ payFormOptions: async () => ["Kaspi", "Наличные"] }));
vi.mock("@/modules/workspace", async (orig) => ({
  ...(await orig<typeof import("@/modules/workspace")>()),
  listFields: async () => [],
  getSetting: async () => null,
}));
const outcome = () => (shared.refuse ? { error: shared.refuse } : { ok: "Сохранено" });
vi.mock("@/server/crm-actions/admin", () => ({
  changeOrderTermsAction: async () => outcome(),
  requestOrderRepriceAction: async () => outcome(),
  reviewOrderPaymentAction: async () => outcome(),
  saveAdminNoteAction: async () => outcome(),
  startPostpayAction: async () => outcome(),
  toggleBookLockAction: async () => {},
  updateOrderAction: async () => outcome(),
  updateOrderDetailsAction: async () => outcome(),
  voidOrderPaymentAction: async () => outcome(),
}));
vi.mock("@/server/crm-actions/expenses", () => {
  const r = async () => (shared.refuse ? { ok: false, error: shared.refuse } : { ok: true });
  return { addExpenseAction: r, removeExpenseAction: r, updateExpenseAction: r };
});
vi.mock("@/server/crm-actions/finance", () => ({
  resolveFinanceIssueAction: async () => outcome(),
  reviewDealPaymentAction: async () => outcome(),
  undoFinanceResolutionAction: async () => outcome(),
}));
vi.mock("@/server/crm-actions/profit", () => ({ saveFeeRatesAction: async () => (shared.refuse ? { ok: false, error: shared.refuse } : { ok: true }) }));
vi.mock("@/server/crm-actions/invoices", () => {
  const sent = { ok: true, message: "Счёт отправлен", link: "https://pay.example/1", text: "Оплатите", sent: true };
  const fail = () => ({ ok: false, message: shared.refuse });
  return {
    invoiceFormInfoAction: async () => (shared.refuse ? fail() : { ok: true, info: await sample("crmInvoiceForm") }),
    issueInvoiceAction: async () => (shared.refuse ? fail() : sent),
    cancelInvoiceAction: async () => (shared.refuse ? fail() : { ok: true, message: "Счёт отменён" }),
    resendInvoiceAction: async () => (shared.refuse ? fail() : sent),
  };
});
vi.mock("@/server/site-handlers/admin/orders-id-payments", () => ({
  POST: async () => (shared.refuse ? Response.json({ error: shared.refuse }, { status: 400 }) : Response.json({ ok: true, settled: true, overpaid: 1000 })),
}));
vi.mock("@/server/site-handlers/admin/orders-id-refunds", () => ({
  POST: async () => (shared.refuse ? Response.json({ error: shared.refuse }, { status: 400 }) : Response.json({ ok: true })),
}));

const { assertRouteParity, createLegacyTestApp } = await import("./parity");
const { legacyOrdersPorts } = await import("../src/legacy/orders.ports");
const { ORDERS_API_ROUTES } = await import("@/server/api-v1/orders");

const asOwner = { cookie: `mb_session=${sessionOf(OWNER)}` };
const asSales = { cookie: `mb_session=${sessionOf(SALES)}` };
const asNoPerms = { cookie: `mb_session=${sessionOf(NO_PERMS)}` };
const asClient = { cookie: `mb_session=${sessionOf(CLIENT)}` };
const asOther = { cookie: `mb_session=${sessionOf(OTHER)}` };

type Case = { method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; url: string; body?: Record<string, unknown>; multipart?: boolean; who: Record<string, string> };

/** Запрос случая от имени who: тело — JSON или чек multipart. */
const send = (c: Case, who: Record<string, string>) =>
  c.multipart ? { method: c.method, url: c.url, headers: { ...who, ...receipt().headers }, body: receipt().body } : { method: c.method, url: c.url, headers: who, body: c.body };

const checkoutBody = { plan: "hardcover", quantity: 1, delivery: "courier", addons: [], promoCode: "", mode: null };
const contact = { contactName: "Асель", contactPhone: "+77011234567", contactEmail: "asel@example.kz" };
const placeBody = { ...checkoutBody, promoCode: null, ...contact, country: "KZ", city: "Алматы", address: "Абая 1", postalCode: "", comment: "", giftNote: "", desiredDate: "", surprise: false, consent: true };

/** Чек оплаты или возврата — multipart с файлом (сумма и ключ — в строке запроса). */
function receipt() {
  const boundary = "----ParityOrdersReceipt";
  return {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    body: Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="check.jpg"\r\nContent-Type: image/jpeg\r\n\r\njpeg-bytes\r\n--${boundary}--\r\n`),
  };
}
const payQuery = `amount=29000&requestKey=${PAYMENT_ID}`;

/** Успешный вызов каждого маршрута: метод, адрес, тело и кто вызывает (клиент — свои заказы, руководитель — CRM). */
const CASES: Record<OrdersApiRoute, Case> = {
  cabinetCheckout: { method: "GET", url: `/api/v1/cabinet/books/${BOOK_ID}/checkout`, who: asClient },
  cabinetCheckoutQuote: { method: "POST", url: `/api/v1/cabinet/books/${BOOK_ID}/checkout/quote`, body: checkoutBody, who: asClient },
  cabinetOrderPlace: { method: "POST", url: `/api/v1/cabinet/books/${BOOK_ID}/orders`, body: placeBody, who: asClient },
  cabinetOrders: { method: "GET", url: "/api/v1/cabinet/orders", who: asClient },
  cabinetOrder: { method: "GET", url: `/api/v1/cabinet/orders/${ORDER_ID}`, who: asClient },
  cabinetOrderKaspi: { method: "POST", url: `/api/v1/cabinet/orders/${ORDER_ID}/kaspi`, body: { method: "invoice", phone: "+77011234567" }, who: asClient },
  cabinetOrderKaspiStatus: { method: "GET", url: `/api/v1/cabinet/orders/${ORDER_ID}/kaspi/${INVOICE_ID}`, who: asClient },
  cabinetOrderClaim: { method: "POST", url: `/api/v1/cabinet/orders/${ORDER_ID}/claim`, who: asClient },
  cabinetOrderCancel: { method: "POST", url: `/api/v1/cabinet/orders/${ORDER_ID}/cancel`, who: asClient },
  webCheckoutPage: { method: "GET", url: `/api/v1/web/books/${BOOK_ID}/checkout?locale=ru`, who: asClient },
  webPromoCheck: { method: "POST", url: "/api/v1/web/checkout/promo-check", body: { code: "MAMA", locale: "ru" }, who: asClient },
  webOrderPlace: { method: "POST", url: "/api/v1/web/orders", body: { bookId: BOOK_ID, plan: "hardcover", quantity: 1, ...contact, delivery: "pickup", consent: true, locale: "ru" }, who: asClient },
  webOrdersList: { method: "GET", url: "/api/v1/web/orders?locale=ru", who: asClient },
  webOrderDetail: { method: "GET", url: `/api/v1/web/orders/${ORDER_ID}?locale=ru`, who: asClient },
  webOrderLayoutApprove: { method: "POST", url: `/api/v1/web/orders/${ORDER_ID}/layout-approval`, who: asClient },
  webPayPage: { method: "GET", url: "/api/v1/web/pay/pay-token", who: {} },
  webPayViewed: { method: "POST", url: "/api/v1/web/pay/pay-token/viewed", who: {} },
  webPayClaim: { method: "POST", url: "/api/v1/web/pay/claim", body: { token: "pay-token", locale: "ru" }, who: {} },
  crmOrderMoney: { method: "GET", url: `/api/v1/crm/orders/${ORDER_ID}/money`, who: asOwner },
  crmOrderPay: { method: "POST", url: `/api/v1/crm/orders/${ORDER_ID}/payments?${payQuery}`, multipart: true, who: asOwner },
  crmOrderRefund: { method: "POST", url: `/api/v1/crm/orders/${ORDER_ID}/refunds?${payQuery}`, multipart: true, who: asOwner },
  crmOrderPaymentVoid: { method: "POST", url: `/api/v1/crm/orders/payments/${PAYMENT_ID}/void`, body: { reason: "Ошибка" }, who: asOwner },
  crmOrderPaymentReview: { method: "POST", url: `/api/v1/crm/orders/payments/${PAYMENT_ID}/review`, who: asOwner },
  crmOrderPostpay: { method: "POST", url: `/api/v1/crm/orders/${ORDER_ID}/postpay`, body: { reason: "Договорились" }, who: asOwner },
  crmOrderTerms: { method: "PUT", url: `/api/v1/crm/orders/${ORDER_ID}/terms`, body: { plan: "hardcover", agreedTotal: 25000, reason: "Скидка" }, who: asOwner },
  crmOrderRepriceRequest: { method: "POST", url: `/api/v1/crm/orders/${ORDER_ID}/reprice-request`, body: { price: 25000, reason: "Скидка" }, who: asOwner },
  crmOrderDelivery: { method: "PATCH", url: `/api/v1/crm/orders/${ORDER_ID}/delivery`, body: { status: "shipped", trackingNumber: "KZ123" }, who: asOwner },
  crmOrderFiles: { method: "GET", url: `/api/v1/crm/orders/${ORDER_ID}/files`, who: asOwner },
  crmOrderDetails: { method: "GET", url: `/api/v1/crm/orders/${ORDER_ID}/details`, who: asOwner },
  crmOrderDetailsUpdate: {
    method: "PUT",
    url: `/api/v1/crm/orders/${ORDER_ID}/details`,
    body: { contactName: "Асель", contactPhone: "+77011234567", contactEmail: "asel@example.kz", deliveryMethod: "courier", country: "KZ", city: "Алматы", address: "Абая 1", postalCode: null, desiredDate: null, giftNote: null },
    who: asOwner,
  },
  crmOrderLinks: { method: "GET", url: `/api/v1/crm/orders/${ORDER_ID}/links`, who: asOwner },
  crmOrderNote: { method: "PUT", url: `/api/v1/crm/orders/${ORDER_ID}/note`, body: { note: "Позвонить" }, who: asOwner },
  crmOrderBookLock: { method: "POST", url: `/api/v1/crm/orders/${ORDER_ID}/book-lock`, body: { locked: false }, who: asOwner },
  crmFinance: { method: "GET", url: "/api/v1/crm/finance?p=month", who: asOwner },
  crmFinanceReview: { method: "POST", url: "/api/v1/crm/finance/review", body: { kind: "order", id: PAYMENT_ID }, who: asOwner },
  crmFinanceResolve: { method: "POST", url: "/api/v1/crm/finance/issues", body: { key: "order:1", amount: 1000, note: "Вернули" }, who: asOwner },
  crmFinanceUndo: { method: "POST", url: `/api/v1/crm/finance/resolutions/${RESOLUTION_ID}/undo`, who: asOwner },
  crmExpenses: { method: "GET", url: "/api/v1/crm/expenses?p=month", who: asOwner },
  crmExpenseAdd: { method: "POST", url: "/api/v1/crm/expenses", body: { day: "2026-11-25", category: "print", amount: 8500, note: "" }, who: asOwner },
  crmExpenseUpdate: { method: "PUT", url: `/api/v1/crm/expenses/${EXPENSE_ID}`, body: { day: "2026-11-25", category: "print", amount: 9000, note: "" }, who: asOwner },
  crmExpenseRemove: { method: "DELETE", url: `/api/v1/crm/expenses/${EXPENSE_ID}?source=expense`, who: asOwner },
  crmProfit: { method: "GET", url: "/api/v1/crm/profit?p=month", who: asOwner },
  crmProfitFees: { method: "PUT", url: "/api/v1/crm/profit/fees", body: { rates: [{ form: "Kaspi", rate: 1 }], taxRate: 3 }, who: asOwner },
  crmInvoiceForm: { method: "GET", url: `/api/v1/crm/invoices/form?dealId=${DEAL_ID}`, who: asOwner },
  crmInvoiceIssue: { method: "POST", url: "/api/v1/crm/invoices", body: { dealId: DEAL_ID, channel: "whatsapp", plan: "hardcover", agreedTotal: 29000, amount: 29000, purpose: "full" }, who: asOwner },
  crmInvoiceCancel: { method: "POST", url: `/api/v1/crm/invoices/${INVOICE_ID}/cancel`, who: asOwner },
  crmInvoiceResend: { method: "POST", url: `/api/v1/crm/invoices/${INVOICE_ID}/resend`, who: asOwner },
};

let app: NestFastifyApplication;
let legacy: ReturnType<typeof createLegacyTestApp>;

beforeAll(async () => {
  // Отчёты денег считают период от «сейчас»: часы закреплены, ожидаемые ответы не зависят от дня прогона.
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-26T10:00:00Z") });
  const ports = (legacyOrdersPorts as { useFactory: () => unknown }).useFactory();
  ({ app } = await bootTestApp({
    users: ALL_USERS,
    overrides: [
      [STAFF_ACCESS, staffAccess],
      [ORDERS_API_PORTS, ports],
      [CABINET_BOOK_PORTS, { visibleBook: mockContainer.authoring.queries.visibleBook }],
    ],
  }));
  legacy = createLegacyTestApp({
    users: ALL_USERS,
    staff: async (user) => {
      if (!resolveStaffSync(user)) {
        const { HttpError } = await import("@/server/api");
        throw new HttpError(403, "forbidden");
      }
    },
  });
});

afterAll(async () => {
  await app.close();
  vi.useRealTimers();
});

beforeEach(() => {
  shared.refuse = null;
  shared.allowRate = true;
});

async function collect(run: (key: OrdersApiRoute, c: Case) => Promise<{ nestRes: { statusCode: number } }>) {
  const failed: string[] = [];
  const statuses: Record<string, number> = {};
  for (const key of ORDERS_API_ROUTES) {
    try {
      statuses[key] = (await run(key, CASES[key])).nestRes.statusCode;
    } catch (err) {
      failed.push(`${key}: ${String(err instanceof Error ? err.message : err).split("\n")[0]}`);
    }
  }
  return { failed, statuses };
}

describe("побайтовый паритет NestJS ↔ mybook-api: Контекст 7A — 47 маршрутов заказов и денег", () => {
  it("маршруты общего кода и Nest — одни и те же 47, у каждого есть случай и маршрут контракта", () => {
    expect(ORDERS_API_ROUTES).toHaveLength(47);
    expect(Object.keys(CASES).sort()).toEqual([...ORDERS_API_ROUTES].sort());
    for (const key of ORDERS_API_ROUTES) {
      const def = v1[key];
      expect(def, key).toBeDefined();
      expect(CASES[key].method, key).toBe(def.method);
    }
  });

  it("успешный вызов каждого маршрута совпадает байт в байт (GET — с ETag и 304)", async () => {
    const { failed, statuses } = await collect((key, c) => assertRouteParity({ nest: app, legacy, ...send(c, c.who) }));
    expect(failed).toEqual([]);
    expect(Object.entries(statuses).filter(([, s]) => s >= 300).map(([k, s]) => `${k} → ${s}`)).toEqual([]);
  });

  for (const [who, headers] of [
    ["без входа", {}],
    ["чужой клиент", asOther],
    ["сотрудник без прав", asNoPerms],
    ["менеджер «только свои» (заказ не его)", asSales],
  ] as const) {
    it(`${who}: ответ каждого маршрута совпадает байт в байт`, async () => {
      const { failed } = await collect((key, c) => assertRouteParity({ nest: app, legacy, ...send(c, headers) }));
      expect(failed).toEqual([]);
    });
  }

  it("отказы, лимиты и кривой вход совпадают байт в байт", async () => {
    shared.refuse = "Нельзя: заказ уже оплачен";
    const { failed } = await collect((key, c) => assertRouteParity({ nest: app, legacy, ...send(c, c.who) }));
    expect(failed).toEqual([]);
    shared.refuse = null;

    shared.allowRate = false;
    await assertRouteParity({ nest: app, legacy, method: "POST", url: `/api/v1/cabinet/orders/${ORDER_ID}/kaspi`, headers: asClient, body: { method: "invoice", phone: "+77011234567" } });
    await assertRouteParity({ nest: app, legacy, method: "POST", url: "/api/v1/web/pay/claim", body: { token: "pay-token", locale: "ru" } });
    shared.allowRate = true;

    await assertRouteParity({ nest: app, legacy, method: "GET", url: "/api/v1/crm/orders/not-a-uuid/money", headers: asOwner });
    await assertRouteParity({ nest: app, legacy, method: "POST", url: "/api/v1/crm/expenses", headers: asOwner, body: { amount: "много" } });
    await assertRouteParity({ nest: app, legacy, method: "DELETE", url: "/api/v1/crm/finance", headers: asOwner });
    await assertRouteParity({ nest: app, legacy, method: "GET", url: "/api/v1/web/pay/unknown", headers: {} });
    // Сотрудник, открывший ссылку оплаты из CRM, — не «клиент посмотрел»: ни один процесс просмотр не отмечает.
    shared.viewed = 0;
    await assertRouteParity({ nest: app, legacy, method: "POST", url: "/api/v1/web/pay/pay-token/viewed", headers: asOwner });
    expect(shared.viewed).toBe(0);
    await assertRouteParity({ nest: app, legacy, method: "POST", url: "/api/v1/web/pay/pay-token/viewed", headers: asClient });
    expect(shared.viewed).toBe(2);
  });

  it("согласование макета: отказы домена (книга открыта для правок, книги нет, заказ без печати) — те же статусы и тексты", async () => {
    const url = `/api/v1/web/orders/${ORDER_ID}/layout-approval`;
    for (const [refusal, status] of [["layoutBookEditing", 409], ["layoutNotApproved", 403], ["layoutNotNeeded", 409]] as const) {
      shared.layoutRefusal = refusal;
      const { nestRes } = await assertRouteParity({ nest: app, legacy, method: "POST", url, headers: asClient });
      expect([nestRes.statusCode, (nestRes.json() as { code?: string }).code], refusal).toEqual([status, refusal]);
    }
    shared.layoutRefusal = null;
    const { nestRes } = await assertRouteParity({ nest: app, legacy, method: "POST", url, headers: asClient });
    expect(nestRes.json()).toEqual({ state: "approved", again: false, approvedAt: PAID_AT.toISOString() });
    // Чужой заказ — 404, как будто его нет.
    const other = await assertRouteParity({ nest: app, legacy, method: "POST", url, headers: asOther });
    expect(other.nestRes.statusCode).toBe(404);
  });
});
