import { execFileSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DealInvoice, type DealInvoiceProps } from "@/modules/ordering/domain";
import { ForbiddenError } from "@/server/access";
import { cancelInvoiceAction, invoiceAccountsAction, invoiceFormInfoAction, issueInvoiceAction, resendInvoiceAccessAction, resendInvoiceAction, type InvoiceFormInfo } from "@/app/admin/invoices/actions";
import { anna, dina, fake, kira, lena, owner, resetContainer, resetRequest, signIn } from "./doubles/web";

vi.mock("next/headers", async () => (await import("./doubles/web")).nextHeaders);
vi.mock("next/navigation", async () => (await import("./doubles/web")).nextNavigation);
vi.mock("next/cache", async () => (await import("./doubles/web")).nextCache);
vi.mock("@/server/container", async () => (await import("./doubles/web")).containerModule);
/** Настройки CRM без базы: лимит скидки, реквизиты перевода. */
const settings: Record<string, string> = {};
vi.mock("@/modules/workspace", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/workspace")>()),
  getSetting: async (key: string) => settings[key] ?? "",
  getSettings: async (keys: string[]) => Object.fromEntries(keys.map((k) => [k, settings[k] ?? ""])),
}));

// Действия счетов из чата в CRM (зона C): вход через zod, права (chats.send + deals.edit, clients.create), «только свои»
// не трогает чужую сделку, менеджер со скрытыми номерами не видит полных номеров, всё — в журнал.

const DEAL = "0d0d0d0d-0000-4000-8000-000000000001";
const CONV = "0d0d0d0d-0000-4000-8000-000000000002";
const INV = "0d0d0d0d-0000-4000-8000-000000000003";
const CLIENT = "0d0d0d0d-0000-4000-8000-000000000004";
const OTHER = "0d0d0d0d-0000-4000-8000-000000000005";
const STAFFER = "0d0d0d0d-0000-4000-8000-000000000006";
const PHONE = "77011234567";

const thrown = (p: Promise<unknown>) => p.then(() => undefined, (e: unknown) => e);

const invoice = (over: Partial<DealInvoiceProps> = {}) =>
  DealInvoice.restore(INV, {
    number: 12,
    gifts: [],
    booksCount: 1,
    token: "t".repeat(43),
    dealId: DEAL,
    conversationId: CONV,
    phone: PHONE,
    clientName: "Айгерим Сейткали",
    locale: "ru",
    channel: "whatsapp",
    plan: "hardcover",
    agreedTotal: 30_000,
    amount: 15_000,
    purpose: "prepayment",
    status: "pending_payment",
    paidMethod: null,
    paidRef: null,
    paidAt: null,
    claimedAt: null,
    closedReason: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    issuedById: null,
    accessStatus: "none",
    accessUserId: null,
    accessMessageId: null,
    accessAttemptedAt: null,
    issueKey: null,
    createdAt: new Date(),
    ...over,
  });

let deal: { id: string; number: number; title: string; contactName: string; clientId: string | null; assigneeId: string | null; orderId: string | null; amount: number; stageId: string };
let conv: { id: string; dealId: string | null; clientId: string | null; assigneeId: string | null; channel: string; chatId: string; contactName: string };
let invoices: DealInvoice[];
let accounts: Record<string, { id: string; name: string; email: string; phone: string | null; locale: "ru" | "kk"; role: string; managerId: string | null }>;
let searchRows: { id: string; name: string; email: string; phone: string | null; role: string }[];
let log: { audit: { action: string; entityId?: string | null; details?: Record<string, unknown> }[]; setAccess: unknown[][]; issue: Record<string, unknown>[]; send: unknown[][]; search: unknown[][]; cancel: unknown[][] };

beforeEach(() => {
  resetRequest();
  resetContainer();
  for (const k of Object.keys(settings)) delete settings[k];
  settings["pay.transferPhone"] = "+7 700 111 22 33";
  settings["crm.maxDiscount"] = "10";
  deal = { id: DEAL, number: 7, title: "Заявка", contactName: "Айгерим Сейткали", clientId: CLIENT, assigneeId: "lena", orderId: null, amount: 30_000, stageId: "s-open" };
  conv = { id: CONV, dealId: DEAL, clientId: null, assigneeId: "lena", channel: "whatsapp", chatId: PHONE, contactName: "Айгерим" };
  invoices = [invoice()];
  accounts = { [CLIENT]: { id: CLIENT, name: "Айгерим", email: `${PHONE}@phone.invalid`, phone: PHONE, locale: "kk", role: "user", managerId: null } };
  searchRows = [];
  log = { audit: [], setAccess: [], issue: [], send: [], search: [], cancel: [] };
  fake.access.audit = { record: async (e: { action: string; entityId?: string | null; details?: Record<string, unknown> }) => void log.audit.push(e) };
  fake.sales = {
    deals: { findById: async (id: string) => (id === DEAL ? deal : null), stage: async () => ({ kind: "open" }) },
    agreedPlan: { get: async () => "hardcover" },
    agreedGifts: { get: async () => ["delivery"] },
    payments: { paidTotal: async () => 0 },
    batch: { money: async () => ({ size: null, paid: 0 }) },
  };
  fake.messaging = {
    queries: { conversation: async (id: string) => (id === CONV ? conv : null), whatsappForDeal: async () => conv },
    chats: { send: async (...a: unknown[]) => (log.send.push(a), { id: "m1", status: "sent" }) },
  };
  fake.ordering = {
    kaspi: { available: async () => true },
    kaspiWatch: { warning: async () => null },
    invoices: {
      listFor: async () => invoices,
      byId: async (id: string) => invoices.find((i) => i.id === id) ?? null,
      cancel: async (id: string, reason: string) => (log.cancel.push([id, reason]), invoices[0].cancel(reason) ? invoices[0] : null),
      setAccess: async (...a: unknown[]) => void log.setAccess.push(a),
      issue: async (input: Record<string, unknown>) => (log.issue.push(input), { invoice: invoices[0], repeated: false }),
    },
  };
  fake.reporting = {
    clientBrief: async (id: string) => accounts[id] ?? null,
    search: async (...a: unknown[]) => (log.search.push(a), { clientRows: searchRows }),
  };
});

describe("invoiceFormInfoAction: данные формы счёта", () => {
  it("права: без chats.send и deals.edit — нельзя; «только свои» — чужая сделка и чужой диалог недоступны", async () => {
    for (const who of [anna, dina]) {
      signIn(who);
      expect(await thrown(invoiceFormInfoAction({ dealId: DEAL }))).toBeInstanceOf(ForbiddenError);
    }
    signIn(lena);
    deal.assigneeId = "boss";
    expect(await thrown(invoiceFormInfoAction({ dealId: DEAL }))).toBeInstanceOf(ForbiddenError);
    conv.assigneeId = "boss";
    expect(await thrown(invoiceFormInfoAction({ conversationId: CONV }))).toBeInstanceOf(ForbiddenError);
  });

  it("zod: мусор вместо id — «Неверный запрос», до чтения сделки; диалог чужой сделки — отказ", async () => {
    signIn(owner);
    fake.sales.deals = { findById: async () => expect.unreachable("не должен вызываться") };
    expect(await invoiceFormInfoAction({ dealId: "42" })).toEqual({ ok: false, message: "Неверный запрос" });
    expect(await invoiceFormInfoAction({ conversationId: "x" })).toEqual({ ok: false, message: "Неверный запрос" });
    conv.dealId = OTHER;
    expect(await invoiceFormInfoAction({ dealId: DEAL, conversationId: CONV })).toEqual({ ok: false, message: "Диалог относится к другой сделке" });
  });

  it("договорённость, тарифы с ценами, язык аккаунта клиента, Kaspi на номер — только маской, лимит скидки менеджера", async () => {
    signIn(lena);
    const r = await invoiceFormInfoAction({ conversationId: CONV });
    if (!r.ok) throw new Error(r.message);
    const { info } = r;
    expect(info).toMatchObject({ dealId: DEAL, dealNumber: 7, plan: "hardcover", agreedTotal: 30_000, paid: 0, hasOrder: false, orderId: null, closed: false, locale: "kk", channel: "whatsapp", chat: "WhatsApp", maxDiscountPercent: 10 });
    expect(info.plans.find((p) => p.id === "hardcover")).toEqual({ id: "hardcover", label: "Твёрдая обложка", price: 30_000, printed: true, giftwrap: true });
    expect(info.gifts).toEqual(["delivery"]);
    expect(info.kaspiPhoneMasked).toBe("+7 701 ••• •• 67");
    expect(JSON.stringify(info)).not.toContain(PHONE);
    expect(info.methods).toEqual({ kaspi: true, card: false, transfer: true });
    expect(info.open).toEqual({ id: INV, label: "P12", amount: 15_000 });
    expect(info.preview.link.kk).toMatch(/\/kk\/pay\/…$/);
    expect(info.kaspiWarning).toBeNull();
    // Кассир Kaspi отключён (руководителям сообщили) — форма получает текст плашки; сбой чтения состояния форму не ломает.
    fake.ordering.kaspiWatch = { warning: async () => "Кассир Kaspi отключён с 14:05" };
    expect(((await invoiceFormInfoAction({ conversationId: CONV })) as { info: InvoiceFormInfo }).info.kaspiWarning).toBe("Кассир Kaspi отключён с 14:05");
    fake.ordering.kaspiWatch = { warning: async () => Promise.reject(new Error("база")) };
    expect(((await invoiceFormInfoAction({ conversationId: CONV })) as { info: InvoiceFormInfo }).info.kaspiWarning).toBeNull();
    signIn(owner);
    expect((await invoiceFormInfoAction({ dealId: DEAL })) as { info: { maxDiscountPercent: number | null } }).toMatchObject({ info: { maxDiscountPercent: null } });
  });

  it("язык: клиента нет или аккаунт — сотрудник → ru; по сделке заказ — ссылка на заказ; номер вместо имени скрыт от менеджера", async () => {
    signIn(lena);
    accounts[CLIENT] = { ...accounts[CLIENT], role: "admin" };
    deal.orderId = "o1";
    deal.contactName = "+7 701 123 45 67";
    conv.contactName = "";
    const r = (await invoiceFormInfoAction({ dealId: DEAL })) as { ok: true; info: { locale: string; hasOrder: boolean; orderId: string; clientName: string } };
    expect(r.info).toMatchObject({ locale: "ru", hasOrder: true, orderId: "o1", clientName: "" });
    signIn(owner);
    expect(((await invoiceFormInfoAction({ dealId: DEAL })) as typeof r).info.clientName).toBe("+7 701 123 45 67");
  });
});

describe("issueInvoiceAction: выпуск", () => {
  const form = { dealId: DEAL, conversationId: CONV, clientName: "Айгерим", locale: "ru" as const, channel: "instagram", plan: "hardcover", agreedTotal: 30_000, amount: 15_000, purpose: "prepayment" as const, issueKey: "0d0d0d0d-0000-4000-8000-0000000000aa" };

  it("без deals.edit — нельзя; чужая сделка «только своим» — нельзя", async () => {
    signIn(anna);
    expect(await thrown(issueInvoiceAction(form))).toBeInstanceOf(ForbiddenError);
    signIn(lena);
    deal.assigneeId = "boss";
    expect(await thrown(issueInvoiceAction({ ...form, conversationId: "" }))).toBeInstanceOf(ForbiddenError);
  });

  it("zod и правила: канал, тариф, сумма больше цены, нет способа оплаты, лимит частоты, диалог другой сделки", async () => {
    signIn(lena);
    expect(await issueInvoiceAction({ ...form, channel: "радио" })).toEqual({ ok: false, message: "Укажите, откуда пришёл клиент" });
    expect(await issueInvoiceAction({ ...form, plan: "gold" })).toEqual({ ok: false, message: "Выберите тариф договорённости" });
    expect(await issueInvoiceAction({ ...form, amount: 40_000 })).toEqual({ ok: false, message: "Сумма счёта больше цены книги" });
    conv.dealId = OTHER;
    expect(await issueInvoiceAction(form)).toEqual({ ok: false, message: "Диалог относится к другой сделке" });
    conv.dealId = DEAL;
    fake.ordering.kaspi = { available: async () => false };
    settings["pay.transferPhone"] = "";
    expect(await issueInvoiceAction(form)).toEqual({ ok: false, message: "Нет способа оплаты: подключите Kaspi или укажите реквизиты перевода в «Интеграциях»" });
    fake.rateLimiter.hit = async () => false;
    expect((await issueInvoiceAction(form)).message).toContain("Слишком много счетов");
    expect(log.issue).toEqual([]);
  });

  it("выпуск: телефон — из чата (сервер), лимит скидки, ключ формы; сообщение — в чат, журнал", async () => {
    signIn(lena);
    const r = await issueInvoiceAction(form);
    expect(r).toMatchObject({ ok: true, sent: true, message: "Счёт P12 отправлен клиенту" });
    expect(log.issue[0]).toMatchObject({ dealId: DEAL, conversationId: CONV, phone: PHONE, maxDiscountPercent: 10, issueKey: form.issueKey, amount: 15_000, plan: "hardcover" });
    expect(log.send).toHaveLength(1);
    expect(log.audit.map((a) => a.action)).toEqual(["invoice.issue"]);
    expect(JSON.stringify(log.audit)).not.toContain(PHONE);
    // Повтор того же ключа формы — тот же счёт, второй раз клиенту не пишем.
    (fake.ordering.invoices as Record<string, unknown>).issue = async () => ({ invoice: invoices[0], repeated: true });
    expect(await issueInvoiceAction(form)).toMatchObject({ ok: true, sent: false, message: "Счёт P12 уже выставлен" });
    expect(log.send).toHaveLength(1);
  });
});

describe("cancelInvoiceAction и resendInvoiceAction", () => {
  it("права: без deals.edit — нельзя; «только свои» — чужая сделка недоступна", async () => {
    signIn(anna);
    expect(await thrown(cancelInvoiceAction(INV))).toBeInstanceOf(ForbiddenError);
    signIn(lena);
    deal.assigneeId = "boss";
    expect(await thrown(cancelInvoiceAction(INV))).toBeInstanceOf(ForbiddenError);
    expect(await thrown(resendInvoiceAction(INV))).toBeInstanceOf(ForbiddenError);
    expect(log.cancel).toEqual([]);
  });

  it("zod: мусор вместо id — ошибка разбора, до чтения счёта", async () => {
    signIn(owner);
    expect(await thrown(cancelInvoiceAction("P12"))).toBeTruthy();
    expect(log.cancel).toEqual([]);
  });

  it("отмена — в журнал; повтор отправляет тот же текст в чат", async () => {
    signIn(lena);
    expect(await cancelInvoiceAction(INV)).toEqual({ ok: true, message: "Счёт P12 отменён" });
    expect(log.audit.map((a) => a.action)).toEqual(["invoice.cancel"]);
    expect(await cancelInvoiceAction(INV)).toEqual({ ok: false, message: "Счёт уже не ждёт оплаты" });
    invoices = [invoice()];
    const r = await resendInvoiceAction(INV);
    expect(r).toMatchObject({ ok: true, sent: true, message: "Отправлено ещё раз" });
    expect(String(log.send[0][1])).toContain("Счёт P12 на оплату");
  });
});

describe("resendInvoiceAccessAction: доступ в кабинет ещё раз", () => {
  const paid = (over: Partial<DealInvoiceProps> = {}) => [invoice({ status: "paid", paidMethod: "kaspi", paidRef: "op-1", paidAt: new Date(), accessStatus: "sent", ...over })];

  it("права: нужен clients.create; «только свои» — чужая сделка недоступна", async () => {
    invoices = paid();
    signIn(lena);
    expect(await thrown(resendInvoiceAccessAction({ invoiceId: INV }))).toBeInstanceOf(ForbiddenError);
    signIn(kira);
    expect(await thrown(resendInvoiceAccessAction({ invoiceId: INV }))).toBeInstanceOf(ForbiddenError);
    expect(log.setAccess).toEqual([]);
  });

  it("zod и правила: не оплачен, уже отправляется, «нужен менеджер» — только с аккаунтом клиента", async () => {
    signIn(owner);
    expect(await resendInvoiceAccessAction({ invoiceId: "P12" })).toEqual({ ok: false, message: "Неверный запрос" });
    expect(await resendInvoiceAccessAction({ invoiceId: INV, userId: "x" })).toEqual({ ok: false, message: "Неверный запрос" });
    expect(await resendInvoiceAccessAction({ invoiceId: INV })).toEqual({ ok: false, message: "Доступ в кабинет выдаётся после оплаты счёта" });
    invoices = paid({ accessStatus: "due" });
    expect(await resendInvoiceAccessAction({ invoiceId: INV })).toEqual({ ok: false, message: "Доступ уже отправляется — подождите минуту" });
    invoices = paid({ accessStatus: "needs_manager" });
    expect(await resendInvoiceAccessAction({ invoiceId: INV })).toEqual({ ok: false, message: "Выберите аккаунт клиента" });
    accounts[STAFFER] = { id: STAFFER, name: "Сотрудник", email: "s@b.kz", phone: null, locale: "ru", role: "admin", managerId: null };
    expect(await resendInvoiceAccessAction({ invoiceId: INV, userId: STAFFER })).toEqual({ ok: false, message: "Клиент не найден" });
    expect(await resendInvoiceAccessAction({ invoiceId: INV, userId: OTHER })).toEqual({ ok: false, message: "Клиент не найден" });
    expect(log.setAccess).toEqual([]);
  });

  it("повтор и выбранный аккаунт: setAccess(id, 'due', userId?) и журнал", async () => {
    deal.assigneeId = "kira";
    signIn(kira);
    invoices = paid({ accessStatus: "failed" });
    expect(await resendInvoiceAccessAction({ invoiceId: INV })).toMatchObject({ ok: true });
    invoices = paid({ accessStatus: "needs_manager" });
    expect(await resendInvoiceAccessAction({ invoiceId: INV, userId: CLIENT })).toEqual({ ok: true, message: "Доступ отправится выбранному клиенту в течение минуты" });
    expect(log.setAccess).toEqual([
      [INV, "due", undefined],
      [INV, "due", CLIENT],
    ]);
    expect(log.audit.map((a) => [a.action, a.details?.user])).toEqual([
      ["invoice.access", null],
      ["invoice.access", CLIENT],
    ]);
    // Клиент другого менеджера «только своим» недоступен.
    accounts[OTHER] = { id: OTHER, name: "Чужой", email: "o@b.kz", phone: null, locale: "ru", role: "user", managerId: "boss" };
    expect(await resendInvoiceAccessAction({ invoiceId: INV, userId: OTHER })).toEqual({ ok: false, message: "Клиент не найден" });
  });
});

describe("invoiceAccountsAction: чей аккаунт", () => {
  beforeEach(() => {
    invoices = [invoice({ status: "paid", accessStatus: "needs_manager" })];
    deal.assigneeId = "kira";
  });

  it("клиент сделки — сразу; менеджер со скрытыми номерами видит контакты с маской", async () => {
    signIn(kira);
    const r = await invoiceAccountsAction({ invoiceId: INV });
    expect(r).toEqual({ ok: true, accounts: [{ id: CLIENT, name: "Айгерим", contact: "+7 701 ••• •• 67", hint: "клиент сделки" }] });
    expect(log.search).toEqual([]);
  });

  it("поиск: только клиенты (не сотрудники); без права на полные номера совпадение по цифрам телефона не считается", async () => {
    searchRows = [
      { id: OTHER, name: "Айдана", email: "aidana@gmail.com", phone: "77019998877", role: "user" },
      { id: STAFFER, name: "Айдана из команды", email: "team@b.kz", phone: null, role: "admin" },
      { id: "0d0d0d0d-0000-4000-8000-000000000007", name: "Без имени", email: "77015550000@phone.invalid", phone: "77015550000", role: "user" },
    ];
    signIn(kira);
    let r = (await invoiceAccountsAction({ invoiceId: INV, q: "Айдана" })) as { ok: true; accounts: { id: string; contact: string }[] };
    expect(r.accounts.map((a) => a.id)).toEqual([CLIENT, OTHER]);
    expect(JSON.stringify(r)).not.toMatch(/77019998877|aidana@gmail\.com/);
    r = (await invoiceAccountsAction({ invoiceId: INV, q: "7701555" })) as typeof r;
    expect(r.accounts.map((a) => a.id)).toEqual([CLIENT]);
    expect(log.search[0]).toEqual(["Айдана", { userId: "kira", seesAll: false }, { clients: true, orders: false, deals: false, chats: false }]);
    signIn(owner);
    r = (await invoiceAccountsAction({ invoiceId: INV, q: "7701555" })) as typeof r;
    expect(r.accounts.map((a) => a.id)).toContain("0d0d0d0d-0000-4000-8000-000000000007");
    // Руководитель видит контакты полностью.
    expect(r.accounts.find((a) => a.id === OTHER)?.contact).toBe("aidana@gmail.com · +7 701 999 88 77");
  });

  it("права: без clients.create — нельзя; zod — «Неверный запрос»", async () => {
    signIn(lena);
    expect(await thrown(invoiceAccountsAction({ invoiceId: INV }))).toBeInstanceOf(ForbiddenError);
    signIn(owner);
    expect(await invoiceAccountsAction({ invoiceId: "x" })).toEqual({ ok: false, message: "Неверный запрос" });
  });
});

describe("actions.mjs: счета из чата — с правами и zod", () => {
  it("каждое действие счёта проверяет права и вход", () => {
    const report = execFileSync(process.execPath, ["scripts/refactor/actions.mjs"], { encoding: "utf8" });
    const lines = report.split("\n").filter((l) => l.startsWith("src/app/admin/invoices/actions.ts::"));
    expect(lines.map((l) => l.split("::")[1].split(" ")[0]).sort()).toEqual(["cancelInvoiceAction", "invoiceAccountsAction", "invoiceFormInfoAction", "issueInvoiceAction", "resendInvoiceAccessAction", "resendInvoiceAction"]);
    for (const l of lines) expect(l).toMatch(/assertStaff.*\[zod\]$/);
    expect(lines.find((l) => l.includes("::resendInvoiceAccessAction"))).toContain("assertWorkable");
  });
});
