import { describe, expect, it, vi } from "vitest";

// Деньги в API v1 (packages/contracts/src/v1/crm-finance.ts, apps/api/src/routes/crm/finance.ts): действия — те же server
// actions сайта, отказ — текстом (400 refused), разбор входа — до действия.
vi.mock("@/i18n/server", async () => ({ getMessages: async () => ({ api: (await import("@/i18n/messages/ru/api")).api }), getLocale: async () => "ru" }));

const staff = { user: { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" }, scope: "all", context: { isOwner: false, canSee: () => true, canWork: () => true }, permissions: new Set(["analytics.view", "finance.view", "finance.manage", "team.manage", "orders.edit"]) };
vi.mock("@/server/api", async (orig) => ({ ...(await orig<typeof import("@/server/api")>()), apiStaff: vi.fn(async () => staff) }));

const reviewDealPaymentAction = vi.fn(async (id: string) => (void id, { ok: "Отмечено: проверено" }));
const resolveFinanceIssueAction = vi.fn(async (key: string, amount: number, note: string) => (void key, void amount, void note, { error: "Сумма случая изменилась — обновите страницу" }));
vi.mock("@/app/admin/finance/actions", () => ({
  reviewDealPaymentAction: (id: string) => reviewDealPaymentAction(id),
  resolveFinanceIssueAction: (k: string, a: number, n: string) => resolveFinanceIssueAction(k, a, n),
  undoFinanceResolutionAction: vi.fn(async () => ({ ok: "Решение отменено" })),
}));
const reviewOrderPaymentAction = vi.fn(async (id: string) => (void id, { ok: "Оплата сверена" }));
vi.mock("@/app/admin/actions", async (orig) => ({ ...(await orig<object>()), reviewOrderPaymentAction: (id: string) => reviewOrderPaymentAction(id) }));
const addExpenseAction = vi.fn(async (input: Record<string, unknown>) => (void input, { ok: true as const }));
vi.mock("@/app/admin/expenses/actions", () => ({
  addExpenseAction: (i: Record<string, unknown>) => addExpenseAction(i),
  updateExpenseAction: vi.fn(async () => ({ ok: false, error: "Рекламу внесите отдельной записью: у неё канал вместо названия" })),
  removeExpenseAction: vi.fn(async () => ({ ok: true })),
}));

const { createApp } = await import("../apps/api/src/app");
const { handlers } = await import("../apps/api/src/routes");

const auth = { user: async () => ({ id: staff.user.id }) as never, staff: async () => ({ id: staff.user.id }) as never };
const app = createApp(handlers, auth);
const call = (method: string, path: string, body?: unknown) =>
  app(new Request(`http://127.0.0.1:3044${path}`, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }));
const ID = "3f2b8c1e-7a4d-4e5f-9b6c-1d2e3f4a5b6c";

describe("API v1: финансы", () => {
  it("«Проверено»: платёж сделки — действием сделки, заказа — действием заказа", async () => {
    expect(await (await call("POST", "/api/v1/crm/finance/review", { kind: "deal", id: ID })).json()).toEqual({ ok: true, message: "Отмечено: проверено" });
    expect(reviewDealPaymentAction).toHaveBeenCalledWith(ID);
    expect(await (await call("POST", "/api/v1/crm/finance/review", { kind: "order", id: ID })).json()).toEqual({ ok: true, message: "Оплата сверена" });
    expect(reviewOrderPaymentAction).toHaveBeenCalledWith(ID);
  });

  it("«Отметить решённым»: отказ действия — 400 с текстом; короткий комментарий — до действия", async () => {
    const res = await call("POST", "/api/v1/crm/finance/issues", { key: `oo:${ID}`, amount: 2000, note: "зачли в заказ №5" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Сумма случая изменилась — обновите страницу", code: "refused" });
    resolveFinanceIssueAction.mockClear();
    expect((await call("POST", "/api/v1/crm/finance/issues", { key: `oo:${ID}`, amount: 2000, note: "ok" })).status).toBe(400);
    expect(resolveFinanceIssueAction).not.toHaveBeenCalled();
  });
});

describe("API v1: расходы", () => {
  it("новый расход — в действие сайта (количество пустое — пустой строкой)", async () => {
    const res = await call("POST", "/api/v1/crm/expenses", { category: "print", day: "2026-11-20", amount: 8500, title: "Печать №1" });
    expect(await res.json()).toEqual({ ok: true, message: "Расход внесён" });
    expect(addExpenseAction).toHaveBeenCalledWith({ category: "print", day: "2026-11-20", amount: 8500, title: "Печать №1", note: "", quantity: "", channel: undefined });
  });

  it("правка рекламы — отказ текстом действия", async () => {
    const res = await call("PUT", `/api/v1/crm/expenses/${ID}`, { category: "ads", day: "2026-11-20", amount: 1000, channel: "instagram" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Рекламу внесите отдельной записью/);
  });

  it("удаление — с источником записи; без него — 400", async () => {
    expect((await call("DELETE", `/api/v1/crm/expenses/${ID}?source=ads`)).status).toBe(200);
    expect((await call("DELETE", `/api/v1/crm/expenses/${ID}`)).status).toBe(400);
  });
});
