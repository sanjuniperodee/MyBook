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
const createPromoAction = vi.fn(async (state: unknown, form: FormData) => (void state, void form, { error: "Код: 3–40 символов, латиница, цифры, - и _" }));
vi.mock("@/app/admin/actions", async (orig) => ({ ...(await orig<object>()), reviewOrderPaymentAction: (id: string) => reviewOrderPaymentAction(id), createPromoAction: (s: unknown, f: FormData) => createPromoAction(s, f) }));
const moderateReviewAction = vi.fn(async (id: string, action: string) => void (id + action));
vi.mock("@/app/admin/reviews/actions", () => ({ moderateReviewAction: (id: string, a: string) => moderateReviewAction(id, a) }));
const addExpenseAction = vi.fn(async (input: Record<string, unknown>) => (void input, { ok: true as const }));
vi.mock("@/app/admin/expenses/actions", () => ({
  addExpenseAction: (i: Record<string, unknown>) => addExpenseAction(i),
  updateExpenseAction: vi.fn(async () => ({ ok: false, error: "Рекламу внесите отдельной записью: у неё канал вместо названия" })),
  removeExpenseAction: vi.fn(async () => ({ ok: true })),
}));

const setPayFormAction = vi.fn(async (dealId: string, form: string) => (void dealId, form === "Bitcoin" ? { ok: false as const, error: "Такой формы оплаты нет в поле сделки" } : { ok: true as const }));
vi.mock("@/app/admin/sales/actions", () => ({ setPayFormAction: (d: string, f: string) => setPayFormAction(d, f) }));

const saveCrmSettingsAction = vi.fn(async (state: unknown, form: FormData) => (void state, void form, { ok: "Сохранено" }));
const saveBotAction = vi.fn(async (input: Record<string, unknown>) => (void input, { error: "Добавьте хотя бы один вопрос" }));
vi.mock("@/app/admin/settings/crm/actions", () => ({ saveCrmSettingsAction: (s: unknown, f: FormData) => saveCrmSettingsAction(s, f), saveBotAction: (i: Record<string, unknown>) => saveBotAction(i) }));
vi.mock("@/modules/workspace", async (orig) => ({ ...(await orig<object>()), getSetting: async (key: string) => (key === "bot.config" ? JSON.stringify({ channels: ["whatsapp"] }) : null) }));

const updateProductAction = vi.fn(async (id: string, form: FormData) => (void id, void form, { ok: true as const }));
vi.mock("@/app/admin/catalog/actions", () => ({
  createProductAction: vi.fn(async () => ({ ok: true, id: "1" })),
  updateProductAction: (id: string, f: FormData) => updateProductAction(id, f),
  deleteCollectionAction: vi.fn(),
  saveCollectionAction: vi.fn(),
  setProductHiddenAction: vi.fn(),
  syncCatalogAction: vi.fn(),
  deleteProductAction: vi.fn(),
}));

const savePricingAction = vi.fn(async (state: unknown, form: FormData) => (void state, void form, { ok: "Сохранено" }));
vi.mock("@/app/admin/pricing/actions", () => ({ savePricingAction: (s: unknown, f: FormData) => savePricingAction(s, f) }));
const setStaffRoleAction = vi.fn(async (id: string, role: string) => void (id + role));
const setStaffPhoneAction = vi.fn(async (id: string, phone: string) => (void id, void phone, { ok: false, message: "Проверьте номер: нужно не меньше 10 цифр" }));
vi.mock("@/app/admin/team/actions", () => ({
  createStaffAction: vi.fn(),
  resetStaffPasswordAction: vi.fn(),
  revokeStaffAction: vi.fn(),
  setStaffDisabledAction: vi.fn(),
  setStaffExtensionAction: vi.fn(),
  setStaffRoleAction: (id: string, r: string) => setStaffRoleAction(id, r),
  setStaffPhoneAction: (id: string, p: string) => setStaffPhoneAction(id, p),
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

describe("API v1: реестр продаж", () => {
  it("форма оплаты — действием реестра; не из поля сделки — отказ текстом; пусто — снять", async () => {
    expect(await (await call("PUT", `/api/v1/crm/sales/${ID}/pay-form`, { form: "Kaspi Gold" })).json()).toEqual({ ok: true, message: "Форма оплаты: Kaspi Gold" });
    const bad = await call("PUT", `/api/v1/crm/sales/${ID}/pay-form`, { form: "Bitcoin" });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("Такой формы оплаты нет в поле сделки");
    expect(await (await call("PUT", `/api/v1/crm/sales/${ID}/pay-form`, { form: "" })).json()).toEqual({ ok: true, message: "Форма оплаты снята" });
    expect(setPayFormAction).toHaveBeenLastCalledWith(ID, "");
  });
});

describe("API v1: настройки отдела продаж", () => {
  const body = { workDays: [1, 2, 3, 4, 5], from: "09:00", to: "18:00", off: "16.12.2026", slaMinutes: 15, reassignMinutes: 0, autoDealFrom: "book_started", mergeClosedDays: 30, maxDiscount: 10, unsorted: true, digest: false, autoLetters: true, chatReward: false, widgetEnabled: true, widgetChat: false, widgetHelp: true };

  it("форма — как у сайта: дни повторяющимся полем, флажки — «on» или нет", async () => {
    expect(await (await call("PUT", "/api/v1/crm/settings/sales", body)).json()).toEqual({ ok: true, message: "Сохранено" });
    const form = saveCrmSettingsAction.mock.calls[0][1];
    expect(form.getAll("days")).toEqual(["1", "2", "3", "4", "5"]);
    expect(Object.fromEntries([...form.entries()].filter(([k]) => k !== "days"))).toEqual({ from: "09:00", to: "18:00", off: "16.12.2026", slaMinutes: "15", reassignMinutes: "0", autoDealFrom: "book_started", mergeClosedDays: "30", maxDiscount: "10", unsorted: "on", autoLetters: "on", widgetEnabled: "on", widgetHelp: "on" });
  });

  it("режим бота — остальные настройки бота как есть; отказ формы бота — текстом", async () => {
    const res = await call("PUT", "/api/v1/crm/settings/bot-mode", { mode: "always" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Добавьте хотя бы один вопрос");
    expect(saveBotAction.mock.calls[0][0]).toMatchObject({ mode: "always", channels: ["whatsapp"] });
  });
});

describe("API v1: маркетинг", () => {
  it("промокод — в форму сайта (без лимита и срока — без полей), отказ — текстом", async () => {
    const res = await call("POST", "/api/v1/crm/promos", { code: "BLOG 15", kind: "percent", value: 15 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Код: 3–40 символов/);
    expect(Object.fromEntries(createPromoAction.mock.calls[0][1])).toEqual({ code: "BLOG 15", kind: "percent", value: "15" });
  });

  it("модерация отзыва — действие из адреса; неизвестное — 400 до действия", async () => {
    expect(await (await call("POST", `/api/v1/crm/reviews/${ID}/feature`)).json()).toEqual({ ok: true, message: "Закреплён на главной" });
    expect(moderateReviewAction).toHaveBeenCalledWith(ID, "feature");
    moderateReviewAction.mockClear();
    expect((await call("POST", `/api/v1/crm/reviews/${ID}/delete`)).status).toBe(400);
    expect(moderateReviewAction).not.toHaveBeenCalled();
  });
});

describe("API v1: каталог WhatsApp", () => {
  it("фото — загрузкой (токен), товар — JSON с токеном: в действие сайта уходит одна форма с полями, «оставить» и фото", async () => {
    const form = new FormData();
    form.append("image", new File([new Uint8Array([0xff, 0xd8, 0xff])], "a.jpg", { type: "image/jpeg" }));
    const up = await app(new Request("http://127.0.0.1:3044/api/v1/crm/catalog/uploads", { method: "POST", body: form }));
    const { tokens } = (await up.json()) as { tokens: string[] };
    expect(tokens).toHaveLength(1);
    const res = await call("POST", "/api/v1/crm/catalog/products", { id: "123", name: "Книга", description: "Длинное описание", price: "25000", keep: ["https://mmg/1"], uploads: tokens });
    expect(res.status).toBe(200);
    const sent = updateProductAction.mock.calls[0][1];
    expect(sent.get("name")).toBe("Книга");
    expect(sent.get("description")).toBe("Длинное описание");
    expect(sent.get("keepSet")).toBe("1");
    expect(sent.getAll("keep")).toEqual(["https://mmg/1"]);
    expect((sent.get("image") as File).type).toBe("image/jpeg");
    // Токен одноразовый.
    expect((await call("POST", "/api/v1/crm/catalog/products", { id: "123", name: "Книга", uploads: tokens })).status).toBe(400);
  });

  it("не картинка — отказ при загрузке", async () => {
    const form = new FormData();
    form.append("image", new File(["%PDF"], "a.pdf", { type: "application/pdf" }));
    const up = await app(new Request("http://127.0.0.1:3044/api/v1/crm/catalog/uploads", { method: "POST", body: form }));
    expect(up.status).toBe(400);
  });
});

describe("API v1: настройки с телефона", () => {
  it("цены: выключенный переключатель — без поля (как флажок формы), остальное — как есть", async () => {
    await call("PUT", "/api/v1/crm/pricing", { values: { plan_digital_price: "9900", plan_digital_visible: "on", plan_premium_visible: "" } });
    expect(Object.fromEntries(savePricingAction.mock.calls[0][1])).toEqual({ plan_digital_price: "9900", plan_digital_visible: "on" });
  });

  it("сотрудник: роль меняется, неверный телефон — отказ текстом", async () => {
    const res = await call("PATCH", `/api/v1/crm/team/${ID}`, { roleId: "0b6f3c1e-2a4d-4e5f-9b6c-1d2e3f4a5b6c", phone: "123" });
    expect(setStaffRoleAction).toHaveBeenCalledWith(ID, "0b6f3c1e-2a4d-4e5f-9b6c-1d2e3f4a5b6c");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/не меньше 10 цифр/);
  });
});
