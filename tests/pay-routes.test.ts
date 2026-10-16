import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrderingError, PaymentInvoice } from "@/modules/ordering/domain";
import { GET, DELETE } from "@/app/api/payments/kaspi/invoices/[id]/route";
import { POST } from "@/app/api/payments/kaspi/invoices/route";
import robots from "@/app/robots";
import { fake, resetContainer, resetRequest, signIn, client } from "./doubles/web";

vi.mock("next/headers", async () => (await import("./doubles/web")).nextHeaders);
vi.mock("next/navigation", async () => (await import("./doubles/web")).nextNavigation);
vi.mock("next/cache", async () => (await import("./doubles/web")).nextCache);
vi.mock("@/server/container", async () => (await import("./doubles/web")).containerModule);
vi.mock("@/shared/infrastructure/database", () => ({ rootDb: {}, executor: () => ({}) }));

// Роуты счёта Kaspi для страницы /pay/<token>: плательщик без аккаунта, ссылку могли переслать.

const ATTEMPT = "0d0d0d0d-0000-4000-8000-0000000000aa";
const TOKEN = "T".repeat(43);
const attempt = () =>
  PaymentInvoice.issue(ATTEMPT, { provider: "kaspi", target: { kind: "deal_invoice", id: "0d0d0d0d-0000-4000-8000-0000000000bb" }, method: "invoice", externalId: "555", phone: "77011234567", amount: 15000, checkoutUrl: null, qrToken: null, expiresAt: null }, new Date());

let calls: { method: string; args: unknown[] }[];
let payDealInvoice: (...a: unknown[]) => Promise<PaymentInvoice>;

beforeEach(() => {
  resetRequest();
  resetContainer();
  calls = [];
  payDealInvoice = async () => attempt();
  fake.ordering = {
    kaspi: {
      status: async (...args: unknown[]) => (calls.push({ method: "status", args }), attempt()),
      cancel: async (...args: unknown[]) => void calls.push({ method: "cancel", args }),
      payDealInvoice: (...args: unknown[]) => (calls.push({ method: "payDealInvoice", args }), payDealInvoice(...args)),
    },
  };
});

const get = (query: string) => GET(new Request(`http://localhost/api/payments/kaspi/invoices/${ATTEMPT}${query}`), { params: Promise.resolve({ id: ATTEMPT }) });
const post = (body: unknown) => POST(new Request("http://localhost/api/payments/kaspi/invoices", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), {} as never);

describe("GET/DELETE /api/payments/kaspi/invoices/[id]?pay=", () => {
  it("по ссылке счёта — без входа и без 401; номер в ответе только с маской", async () => {
    const res = await get(`?pay=${TOKEN}`);
    expect(res.status).toBe(200);
    expect((await res.json()).invoice).toMatchObject({ id: ATTEMPT, status: "pending", amount: 15000, phone: "+7 701 ••• •• 67" });
    expect(calls).toEqual([{ method: "status", args: [ATTEMPT, { dealInvoiceToken: TOKEN }] }]);
    const del = await DELETE(new Request(`http://localhost/api/payments/kaspi/invoices/${ATTEMPT}?pay=${TOKEN}`, { method: "DELETE" }), { params: Promise.resolve({ id: ATTEMPT }) });
    expect(del.status).toBe(200);
    expect(calls.at(-1)).toEqual({ method: "cancel", args: [ATTEMPT, { dealInvoiceToken: TOKEN }] });
  });

  it("мусорный токен — 404 до запроса в базу; без токена и входа — как раньше, 401 (заказ — только владельцу)", async () => {
    expect((await get("?pay=abc")).status).toBe(404);
    expect((await get(`?pay=${TOKEN}'--`)).status).toBe(404);
    expect(calls).toEqual([]);
    expect((await get("")).status).toBe(401);
  });
});

describe("POST /api/payments/kaspi/invoices: счёт из чата", () => {
  it("без входа; пустой номер уходит в сервис как есть (сервер подставит номер из счёта)", async () => {
    const res = await post({ target: "deal_invoice", token: TOKEN, method: "invoice", phone: "" });
    expect(res.status).toBe(200);
    expect((await res.json()).invoice.phone).toBe("+7 701 ••• •• 67");
    expect(calls).toEqual([{ method: "payDealInvoice", args: [TOKEN, { target: "deal_invoice", token: TOKEN, method: "invoice", phone: "" }] }]);
  });

  it("счёт уже не ждёт оплаты — 409 с текстом про счёт, а не про заказ; мусорный токен — 400", async () => {
    payDealInvoice = async () => {
      throw new OrderingError("notPayable");
    };
    const res = await post({ target: "deal_invoice", token: TOKEN, method: "qr" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Этот счёт уже не ждёт оплаты — обновите страницу", code: "invoiceClosed" });
    expect((await post({ target: "deal_invoice", token: "short", method: "qr" })).status).toBe(400);
  });

  it("лимит частоты на ссылку: номер клиента не засыпать счетами", async () => {
    signIn(client);
    let hits = 0;
    fake.rateLimiter = { hit: async (key: string) => !key.startsWith("kaspi-invoice-pay:") || ++hits <= 1 };
    expect((await post({ target: "deal_invoice", token: TOKEN, method: "qr" })).status).toBe(200);
    expect((await post({ target: "deal_invoice", token: TOKEN, method: "qr" })).status).toBe(429);
  });
});

describe("robots", () => {
  it("страница оплаты по ссылке закрыта на обоих языках", () => {
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(([] as string[]).concat(rule.disallow ?? [])).toEqual(expect.arrayContaining(["/pay/", "/kk/pay/"]));
  });
});
