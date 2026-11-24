import { describe, expect, it, vi } from "vitest";

// CRM-маршруты API v1 (packages/contracts/src/v1/crm.ts, apps/api/src/routes/crm): права, разбор, перевод в форму сайта.
vi.mock("@/i18n/server", async () => ({ getMessages: async () => ({ api: (await import("@/i18n/messages/ru/api")).api }), getLocale: async () => "ru" }));

const staff = { user: { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" }, context: { canSee: () => true, canWork: () => true, canAssignOthers: true }, permissions: new Set(["deals.view", "deals.edit", "clients.contacts"]) };
vi.mock("@/server/api", async (orig) => ({ ...(await orig<typeof import("@/server/api")>()), apiStaff: vi.fn(async () => staff) }));
vi.mock("@/server/access", async (orig) => ({ ...(await orig<typeof import("@/server/access")>()), can: (s: typeof staff, ...p: string[]) => p.every((x) => s.permissions.has(x)) }));

const deal = { id: "3f2b8c1e-7a4d-4e5f-9b6c-1d2e3f4a5b6c", number: 12, title: "Книга маме", contactName: "Айгуль", contactPhone: "77001112233", contactEmail: null, extraPhones: ["77009998877"], amount: 30000, source: "whatsapp", tags: ["свадьба"], customFields: { event: "2026-12-01", vip: true }, assigneeId: null, orderId: null };
vi.mock("@/server/container", () => ({ container: () => ({ sales: { deals: { findById: async () => deal } } }) }));
const defs = [
  { key: "event", label: "Дата события", type: "date", options: [] },
  { key: "vip", label: "VIP", type: "checkbox", options: [] },
];
vi.mock("@/modules/workspace", async (orig) => ({ ...(await orig<object>()), listFields: async () => defs }));
const updateDealAction = vi.fn<(state: unknown, form: FormData) => Promise<{ ok?: string; error?: string }>>(async () => ({ ok: "Сохранено" }));
vi.mock("@/app/admin/deals/actions", () => ({ updateDealAction: (s: unknown, f: FormData) => updateDealAction(s, f), setDealAgreedPlanAction: vi.fn(), setDealAgreedGiftsAction: vi.fn() }));

const payRoute = vi.fn(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  void req;
  void ctx;
  return Response.json({ payment: { id: "p1", amount: 30000 }, settled: true, overpaid: 0 });
});
vi.mock("@/app/api/admin/orders/[id]/payments/route", () => ({ POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => payRoute(req, ctx) }));
vi.mock("@/app/api/admin/orders/[id]/refunds/route", () => ({ POST: vi.fn() }));
const createClientAction = vi.fn<(state: unknown, form: FormData) => Promise<Record<string, unknown>>>(async () => ({ error: "Клиент с таким телефоном или почтой уже есть" }));
vi.mock("@/app/admin/clients/new/actions", () => ({ createClientAction: (s: unknown, f: FormData) => createClientAction(s, f) }));
const updateOrderAction = vi.fn<(state: unknown, form: FormData) => Promise<{ ok?: string; error?: string }>>(async () => ({ ok: "Сохранено" }));
const updateOrderDetailsAction = vi.fn<(state: unknown, form: FormData) => Promise<{ ok?: string; error?: string }>>(async () => ({ error: "Проверьте e-mail" }));
vi.mock("@/app/admin/actions", async (orig) => ({
  ...(await orig<object>()),
  updateOrderAction: (s: unknown, f: FormData) => updateOrderAction(s, f),
  updateOrderDetailsAction: (s: unknown, f: FormData) => updateOrderDetailsAction(s, f),
}));

const { v1 } = await import("@mybook/contracts");
const { createApp } = await import("../apps/api/src/app");
const { createRouter } = await import("../apps/api/src/http/router");
const { handlers } = await import("../apps/api/src/routes");
const { fieldsOut, fieldsToForm } = await import("../apps/api/src/routes/crm/common");
const { HttpError } = await import("@/server/api");

const user = { id: staff.user.id, name: "Менеджер", email: "m@x.kz", phone: null, locale: "ru", role: "admin" } as never;
const auth = (isStaff: boolean) => ({
  user: async () => user,
  staff: async () => {
    if (!isStaff) throw new HttpError(403, "forbidden");
    return user;
  },
});
const call = (app: ReturnType<typeof createApp>, method: string, path: string, body?: unknown) =>
  app(new Request(`http://127.0.0.1:3044${path}`, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }));

describe("CRM v1: маршруты", () => {
  it("пути сделки, клиента и бота — маршруты контракта", () => {
    const router = createRouter(v1);
    expect(router.match("GET", `/api/v1/crm/deals/${deal.id}/form`)).toMatchObject({ name: "crmDealForm" });
    expect(router.match("PATCH", `/api/v1/crm/deals/${deal.id}`)).toMatchObject({ name: "crmDealUpdate" });
    expect(router.match("PUT", `/api/v1/crm/deals/${deal.id}/plan`)).toMatchObject({ name: "crmDealPlan" });
    expect(router.match("POST", `/api/v1/crm/chats/${deal.id}/bot`)).toMatchObject({ name: "crmChatBot" });
    for (const name of Object.keys(v1).filter((n) => n.startsWith("crm"))) expect(v1[name as keyof typeof v1].auth).toBe("staff");
  });

  it("не сотрудник — 403, обработчик не вызывается", async () => {
    const crmDealForm = vi.fn();
    const app = createApp({ ...handlers, crmDealForm } as typeof handlers, auth(false));
    expect((await call(app, "GET", `/api/v1/crm/deals/${deal.id}/form`)).status).toBe(403);
    expect(crmDealForm).not.toHaveBeenCalled();
  });
});

describe("CRM v1: свои поля", () => {
  it("значения — строками туда и обратно; флажок — как в форме сайта (__present и on)", () => {
    expect(fieldsOut(defs as never, { event: "2026-12-01", vip: true })).toEqual([
      { key: "event", label: "Дата события", type: "date", options: [], value: "2026-12-01" },
      { key: "vip", label: "VIP", type: "checkbox", options: [], value: "true" },
    ]);
    const form = new FormData();
    fieldsToForm(form, defs as never, { event: "", vip: "false", unknown: "x" });
    expect(Object.fromEntries(form)).toEqual({ cf_event: "", cf_vip__present: "1" });
  });
});

describe("CRM v1: правка сделки", () => {
  const app = createApp(handlers, auth(true));

  it("правка одного поля не стирает теги, доп. номера и свои поля", async () => {
    updateDealAction.mockClear();
    const res = await call(app, "PATCH", `/api/v1/crm/deals/${deal.id}`, { title: "Книга для мамы" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, message: "Сохранено" });
    const form = Object.fromEntries(updateDealAction.mock.calls[0][1]);
    expect(form).toMatchObject({ id: deal.id, title: "Книга для мамы", contactName: "Айгуль", amount: "30000", source: "whatsapp", tags: "свадьба" });
    // Контакты не правили — их нет в форме, сайт оставит прежние (номер и доп. номера).
    expect(form).not.toHaveProperty("contactPhone");
    expect(Object.keys(form).some((k) => k.startsWith("cf_"))).toBe(false);
  });

  it("контакты — все три вместе, недостающие прежними", async () => {
    updateDealAction.mockClear();
    await call(app, "PATCH", `/api/v1/crm/deals/${deal.id}`, { email: "a@b.kz" });
    expect(Object.fromEntries(updateDealAction.mock.calls[0][1])).toMatchObject({ contactPhone: "77001112233", contactEmail: "a@b.kz", extraPhones: "77009998877" });
  });

  it("отказ действия (лимит скидки) — 400 с текстом для сотрудника и кодом refused", async () => {
    updateDealAction.mockResolvedValueOnce({ error: "Скидка больше вашего лимита" });
    const res = await call(app, "PATCH", `/api/v1/crm/deals/${deal.id}`, { amount: 1000 });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Скидка больше вашего лимита", code: "refused" });
  });

  it("лишнее поле — 400 без вызова действия", async () => {
    updateDealAction.mockClear();
    expect((await call(app, "PATCH", `/api/v1/crm/deals/${deal.id}`, { title: "Книга", hack: 1 })).status).toBe(400);
    expect(updateDealAction).not.toHaveBeenCalled();
  });
});

describe("CRM v1: деньги и доставка заказа", () => {
  const app = createApp(handlers, auth(true));
  const ORDER = "8a7b6c5d-4e3f-4a1b-8c9d-0e1f2a3b4c5d";

  it("оплата: сумма и дата из query и чек — в тот же маршрут денег сайта, успех — текстом", async () => {
    const form = new FormData();
    form.set("file", new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "check.pdf", { type: "application/pdf" }));
    const res = await app(new Request(`http://127.0.0.1:3044/api/v1/crm/orders/${ORDER}/payments?amount=30000&paidAt=2026-11-24&payForm=Kaspi%20Gold&requestKey=0b6f3c1e-2a4d-4e5f-9b6c-1d2e3f4a5b6c`, { method: "POST", body: form }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, message: "Оплата записана, заказ оплачен" });
    const [req, ctx] = payRoute.mock.calls[0];
    expect(await ctx.params).toEqual({ id: ORDER });
    const sent = await req.formData();
    expect(Object.fromEntries([...sent].map(([k, v]) => [k, typeof v === "string" ? v : (v as File).name]))).toEqual({ amount: "30000", paidAt: "2026-11-24", payForm: "Kaspi Gold", requestKey: "0b6f3c1e-2a4d-4e5f-9b6c-1d2e3f4a5b6c", file: "check.pdf" });
  });

  it("отказ маршрута денег (заказ отменён) — его ответ как есть", async () => {
    payRoute.mockResolvedValueOnce(Response.json({ error: "Заказ отменён" }, { status: 409 }));
    const res = await app(new Request(`http://127.0.0.1:3044/api/v1/crm/orders/${ORDER}/payments?amount=1000&requestKey=0b6f3c1e-2a4d-4e5f-9b6c-1d2e3f4a5b6c`, { method: "POST", body: new FormData() }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Заказ отменён" });
  });

  it("сумма не числом — 400 до маршрута денег", async () => {
    payRoute.mockClear();
    const res = await app(new Request(`http://127.0.0.1:3044/api/v1/crm/orders/${ORDER}/payments?amount=1e5&requestKey=0b6f3c1e-2a4d-4e5f-9b6c-1d2e3f4a5b6c`, { method: "POST", body: new FormData() }));
    expect(res.status).toBe(400);
    expect(payRoute).not.toHaveBeenCalled();
  });

  it("статус и трек — форма действия карточки заказа", async () => {
    updateOrderAction.mockClear();
    const res = await call(app, "PATCH", `/api/v1/crm/orders/${ORDER}/delivery`, { status: "shipped", trackingNumber: "KZ123456789" });
    expect(await res.json()).toEqual({ ok: true, message: "Сохранено" });
    expect(Object.fromEntries(updateOrderAction.mock.calls[0][1])).toEqual({ orderId: ORDER, status: "shipped", trackingNumber: "KZ123456789" });
  });

  it("контакты и доставка — вся форма карточки заказа (пустое — стереть), отказ — текстом", async () => {
    const res = await call(app, "PUT", `/api/v1/crm/orders/${ORDER}/details`, { contactName: "Алия", contactPhone: "87001234567", contactEmail: "a@x.kz", deliveryMethod: "courier", city: "Алматы", postalCode: "050010" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Проверьте e-mail", code: "refused" });
    expect(Object.fromEntries(updateOrderDetailsAction.mock.calls[0][1])).toEqual({
      orderId: ORDER,
      contactName: "Алия",
      contactPhone: "87001234567",
      contactEmail: "a@x.kz",
      deliveryMethod: "courier",
      country: "",
      city: "Алматы",
      address: "",
      postalCode: "050010",
      desiredDate: "",
      giftNote: "",
    });
  });

  it("контакты: неизвестный способ доставки — 400 до действия", async () => {
    updateOrderDetailsAction.mockClear();
    const res = await call(app, "PUT", `/api/v1/crm/orders/${ORDER}/details`, { contactName: "Алия", contactPhone: "87001234567", contactEmail: "a@x.kz", deliveryMethod: "drone" });
    expect(res.status).toBe(400);
    expect(updateOrderDetailsAction).not.toHaveBeenCalled();
  });
});

describe("CRM v1: новый клиент со сделкой и предоплатой", () => {
  const app = createApp(handlers, auth(true));

  it("поля — в форму сайта (сделка галочкой, подарки — её полями), отказ — текстом", async () => {
    const res = await call(app, "POST", "/api/v1/crm/clients", {
      name: "Насиба",
      phone: "87750000000",
      channel: "instagram",
      deal: { plan: "hardcover", count: 2, agreed: 28000, prepaid: 20000, payForm: "Kaspi Gold", gifts: ["delivery"], comment: "к юбилею" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Клиент с таким телефоном или почтой уже есть", code: "refused" });
    expect(Object.fromEntries(createClientAction.mock.calls[0][1])).toEqual({
      name: "Насиба",
      phone: "87750000000",
      channel: "instagram",
      createDeal: "on",
      plan: "hardcover",
      count: "2",
      agreed: "28000",
      prepaid: "20000",
      payForm: "Kaspi Gold",
      comment: "к юбилею",
      giftDelivery: "on",
    });
  });

  it("без сделки — без её полей", async () => {
    createClientAction.mockClear();
    await call(app, "POST", "/api/v1/crm/clients", { name: "Асель", phone: "87001112233", channel: "call" });
    expect(Object.fromEntries(createClientAction.mock.calls[0][1])).toEqual({ name: "Асель", phone: "87001112233", channel: "call" });
  });
});
