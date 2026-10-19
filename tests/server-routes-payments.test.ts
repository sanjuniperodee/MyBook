import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentError, ReceiptError, RECEIPT_MAX_BYTES } from "@/modules/sales";
import { POST as acceptPayment } from "@/app/api/admin/deals/[id]/payments/route";
import { POST as attachReceipt } from "@/app/api/admin/deals/[id]/receipts/route";
import { DELETE as removePayment } from "@/app/api/admin/payments/[id]/route";
import { PaymentIntakeService } from "@/modules/sales/application";
import { DealInvoice } from "@/modules/ordering/domain";
import { anna, client, fake, owner, request, resetContainer, resetRequest, signIn } from "./doubles/web";

vi.mock("next/headers", async () => (await import("./doubles/web")).nextHeaders);
vi.mock("next/navigation", async () => (await import("./doubles/web")).nextNavigation);
vi.mock("next/cache", async () => (await import("./doubles/web")).nextCache);
vi.mock("@/server/container", async () => (await import("./doubles/web")).containerModule);
vi.mock("@/shared/infrastructure/database", () => ({ rootDb: {}, executor: () => ({}) }));

// Характеристические тесты роутов платежей и чеков (E4): тексты и статусы отказов до и после перехода с bad() на HttpError.

const DEAL = "0d0d0d0d-0000-4000-8000-000000000001";
const ctx = { params: Promise.resolve({ id: DEAL }) };
const PDF = new File([Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3])], "чек.pdf", { type: "application/pdf" });

const form = (fields: Record<string, string | File>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

const post = (route: typeof acceptPayment, fields: Record<string, string | File>) =>
  route(new Request(`http://localhost/api/admin/deals/${DEAL}/x`, { method: "POST", body: form(fields) }), ctx).then(async (res) => ({ status: res.status, body: (await res.json()) as { error?: string; code?: string } }));

let deal: { id: string; clientId: string | null; assigneeId: string | null; orderId: string | null; number: number; amount: number } | null;
let payments: Record<string, (...a: never[]) => Promise<unknown>>;
let receipts: Record<string, (...a: never[]) => Promise<unknown>>;
/** Счета из чата по сделке и записанные платежи — для защиты от двойной записи. */
let invoices: DealInvoice[];
let paymentRows: { id: string; amount: number; kind: string; method: string; paidAt: Date }[];
let intakeInput: { invoice?: unknown; amount?: number } | null;
let marked: unknown[];

beforeEach(() => {
  resetRequest();
  resetContainer();
  signIn(owner);
  deal = { id: DEAL, clientId: "c1", assigneeId: null, orderId: null, number: 7, amount: 100_000 };
  payments = { add: async () => ({ id: "p1", amount: 5000, kind: "payment", paidAt: new Date(), note: "" }), find: async () => ({ id: "p1", dealId: DEAL }), paidTotal: async () => 5000, remove: async () => {}, list: async () => paymentRows };
  invoices = [];
  paymentRows = [];
  intakeInput = null;
  marked = [];
  receipts = {
    add: async () => ({ id: "r1", fileName: "чек.pdf", amount: 5000, mime: "application/pdf", size: 8, createdAt: new Date() }),
    // Приём платежа: файл чека — до денег (stage), запись — после (record), откат — discard.
    stage: async () => "staged",
    record: async () => receipts.add(),
    discard: async () => {},
  };
  // Сценарий приёма — настоящий PaymentIntakeService поверх тех же фейков: правки payments и receipts в тестах видны ему.
  const intake = new PaymentIntakeService(payments as never, receipts as never, { note: async () => {}, audit: async () => {}, mailClient: async () => {}, markInvoicePaid: async (i) => void marked.push(i) }, { run: (work) => work() });
  const accept = intake.acceptWithReceipt.bind(intake);
  intake.acceptWithReceipt = (input) => ((intakeInput = input), accept(input));
  fake.sales = { deals: { findById: async () => deal }, payments, receipts, intake };
  fake.ordering = { invoices: { byId: async (id: string) => invoices.find((i) => i.id === id) ?? null, listFor: async () => invoices } };
  fake.clients = { notes: { add: async () => {} } };
});

describe("POST /api/admin/deals/[id]/payments: отказы", () => {
  const accept = (extra: Record<string, string | File> = {}) => post(acceptPayment, { amount: "5000", file: PDF, ...extra });

  it("права и сделка: не сотрудник и сотрудник без права — 403; сделки нет — 404; по сделке есть заказ — 409", async () => {
    signIn(client);
    expect((await accept()).status).toBe(403);
    signIn(anna);
    expect((await accept()).status).toBe(403);
    signIn(owner);
    deal = null;
    expect(await accept()).toMatchObject({ status: 404, body: { error: "Сделка не найдена" } });
    deal = { id: DEAL, clientId: "c1", assigneeId: null, orderId: "o1", number: 7, amount: 100_000 };
    expect(await accept()).toMatchObject({ status: 409, body: { error: "По сделке уже оформлен заказ: оплату принимайте в карточке заказа" } });
  });

  it("форма: причина возврата, чек обязателен, размер, тип по содержимому, дата — 400 с текстом для менеджера", async () => {
    expect(await accept({ kind: "refund", note: "ну" })).toMatchObject({ status: 400, body: { error: "Укажите причину возврата" } });
    expect(await post(acceptPayment, { amount: "5000" })).toMatchObject({ status: 400, body: { error: "Приложите чек: платёж без чека не принимается" } });
    const big = new File([new Uint8Array(RECEIPT_MAX_BYTES + 1)], "большой.jpg");
    expect(await accept({ file: big })).toMatchObject({ status: 400, body: { error: "Файл больше 12 МБ" } });
    expect(await accept({ file: new File(["<html></html>"], "x.pdf") })).toMatchObject({ status: 400, body: { error: "Нужен файл JPG, PNG, WEBP или PDF" } });
    expect(await accept({ file: new File([], "пустой.pdf") })).toMatchObject({ status: 400, body: { error: "Приложите чек: платёж без чека не принимается" } });
    expect(await accept({ paidAt: "вчера" })).toMatchObject({ status: 400, body: { error: "Проверьте дату платежа" } });
  });

  it("PaymentError домена — свой текст на каждый код; ReceiptError после платежа — «Не удалось сохранить чек»; прочее — 500", async () => {
    const expectations = [
      ["amount", "Проверьте сумму"],
      ["refundTooBig", "Нельзя вернуть больше, чем принято"],
      ["date", "Дата не может быть в будущем"],
    ] as const;
    for (const [code, error] of expectations) {
      payments.add = async () => {
        throw new PaymentError(code);
      };
      expect(await accept()).toMatchObject({ status: 400, body: { error } });
    }
    payments.add = async () => ({ id: "p1", amount: 5000, kind: "payment", paidAt: new Date(), note: "" });
    receipts.add = async () => {
      throw new ReceiptError("type");
    };
    expect(await accept()).toMatchObject({ status: 400, body: { error: "Не удалось сохранить чек" } });
    receipts.add = async () => {
      throw new Error("диск полон");
    };
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await accept()).toMatchObject({ status: 500 });
    logged.mockRestore();
  });

  it("ответ — { error, code }: код ключа словаря admin; язык не влияет — по-русски, даже если в cookie выбран казахский", async () => {
    request.cookies.set("mb_locale", "kk");
    deal = null;
    expect(await accept()).toEqual({ status: 404, body: { error: "Сделка не найдена", code: "dealNotFound" } });
    deal = { id: DEAL, clientId: "c1", assigneeId: null, orderId: null, number: 7, amount: 100_000 };
    expect(await accept({ file: new File([new Uint8Array(RECEIPT_MAX_BYTES + 1)], "большой.jpg") })).toEqual({ status: 400, body: { error: "Файл больше 12 МБ", code: "receiptTooBig" } });
  });
});

describe("POST /api/admin/deals/[id]/receipts: отказы", () => {
  const attach = (extra: Record<string, string | File> = {}) => post(attachReceipt, { amount: "5000", file: PDF, ...extra });

  it("сделки нет — 404; нет файла, файл больше предела, плохая сумма — 400", async () => {
    deal = null;
    expect(await attach()).toMatchObject({ status: 404, body: { error: "Сделка не найдена" } });
    deal = { id: DEAL, clientId: "c1", assigneeId: null, orderId: null, number: 7, amount: 100_000 };
    expect(await post(attachReceipt, { amount: "5000" })).toMatchObject({ status: 400, body: { error: "Выберите файл чека" } });
    expect(await attach({ file: new File([new Uint8Array(RECEIPT_MAX_BYTES + 1)], "большой.jpg") })).toMatchObject({ status: 400, body: { error: "Файл больше 12 МБ" } });
    expect(await attach({ amount: "-1" })).toMatchObject({ status: 400, body: { error: "Проверьте сумму" } });
    expect(await attach({ amount: "100000001" })).toMatchObject({ status: 400, body: { error: "Проверьте сумму" } });
  });

  it("платёж другой сделки, неизвестный или не UUID — 400 «Платёж не найден»; ReceiptError — текст по причине", async () => {
    const P9 = "99999999-9999-4999-8999-999999999999";
    payments.find = async () => ({ id: P9, dealId: "other" });
    expect(await attach({ paymentId: P9 })).toMatchObject({ status: 400, body: { error: "Платёж не найден" } });
    payments.find = async () => null;
    expect(await attach({ paymentId: P9 })).toMatchObject({ status: 400, body: { error: "Платёж не найден" } });
    // Мусор вместо id отсекает схема — до запроса к базе (решение 7), текст тот же.
    payments.find = async () => {
      throw new Error("не должен вызываться");
    };
    expect(await attach({ paymentId: "p9" })).toMatchObject({ status: 400, body: { error: "Платёж не найден", code: "paymentNotFound" } });
    const texts = { empty: "Файл пустой", tooBig: "Файл больше 12 МБ", type: "Нужен файл JPG, PNG, WEBP или PDF" } as const;
    for (const [problem, error] of Object.entries(texts)) {
      receipts.add = async () => {
        throw new ReceiptError(problem as keyof typeof texts);
      };
      expect(await attach()).toMatchObject({ status: 400, body: { error } });
    }
  });

  it("успех: чек сохранён, ответ — карточка чека", async () => {
    const res = await attach();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ receipt: { id: "r1", fileName: "чек.pdf", amount: 5000 } });
  });
});

const INV = "0d0d0d0d-0000-4000-8000-0000000000a1";
const invoice = (over: Partial<Parameters<typeof DealInvoice.restore>[1]> = {}) =>
  DealInvoice.restore(INV, {
    number: 12,
    gifts: [],
    booksCount: 1,
    token: "t".repeat(43),
    dealId: DEAL,
    conversationId: null,
    phone: null,
    clientName: "",
    locale: "ru",
    channel: "whatsapp",
    plan: "hardcover",
    agreedTotal: 30_000,
    amount: 5_000,
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

describe("POST /api/admin/deals/[id]/payments: счёт из чата и защита от двойной записи", () => {
  const accept = (extra: Record<string, string | File> = {}) => post(acceptPayment, { amount: "5000", file: PDF, ...extra });

  it("по счёту: счёт этой сделки, не оплачен, ровно его сумма; возврат — без счёта", async () => {
    expect(await accept({ invoiceId: INV })).toMatchObject({ status: 404 });
    invoices = [invoice({ dealId: "0d0d0d0d-0000-4000-8000-0000000000ff" })];
    expect(await accept({ invoiceId: INV })).toMatchObject({ status: 404 });
    invoices = [invoice({ status: "paid" })];
    expect(await accept({ invoiceId: INV })).toMatchObject({ status: 409, body: { error: "Счёт P12 уже оплачен" } });
    invoices = [invoice()];
    expect(await accept({ invoiceId: INV, amount: "2500" })).toMatchObject({ status: 400, body: { error: expect.stringContaining("Сумма по счёту P12") } });
    expect(await accept({ invoiceId: INV, kind: "refund", note: "ошибка" })).toMatchObject({ status: 400, body: { error: "Возврат оформляется без счёта" } });
    expect(intakeInput).toBeNull();
    expect(await accept({ invoiceId: INV })).toMatchObject({ status: 200 });
    expect(intakeInput).toMatchObject({ invoice: { id: INV, amount: 5000 }, amount: 5000 });
    expect(marked).toEqual([{ invoiceId: INV, dealId: DEAL, paymentId: null }]);
  });

  it("открытый счёт: «не по счёту» — только если менеджер его видел (seen), иначе 409 invoiceChoice", async () => {
    invoices = [invoice()];
    expect(await accept()).toMatchObject({ status: 409, body: { code: "invoiceChoice", error: expect.stringContaining("открыт счёт P12") } });
    expect(await accept({ seen: "other" })).toMatchObject({ status: 409 });
    expect(await accept({ seen: INV })).toMatchObject({ status: 200 });
    expect(intakeInput).toMatchObject({ invoice: null });
    // Возврат защита не останавливает: деньги уходят клиенту, а не приходят.
    intakeInput = null;
    payments.refund = async () => ({ id: "p9", amount: 1000, kind: "refund", paidAt: new Date(), note: "вернули часть" });
    expect(await accept({ kind: "refund", amount: "1000", note: "вернули часть" })).toMatchObject({ status: 200 });
    expect(intakeInput).toMatchObject({ invoice: null, amount: 1000 });
  });

  it("онлайн-оплата за 72 ч — тоже явный выбор; старая онлайн-оплата и ручные платежи не мешают", async () => {
    const hour = 3_600_000;
    paymentRows = [{ id: "p-old", amount: 5000, kind: "payment", method: "kaspi", paidAt: new Date(Date.now() - 73 * hour) }, { id: "p-man", amount: 5000, kind: "payment", method: "manual", paidAt: new Date() }];
    expect(await accept()).toMatchObject({ status: 200 });
    paymentRows.push({ id: "p-new", amount: 5000, kind: "prepayment", method: "cloudpayments", paidAt: new Date(Date.now() - hour) });
    expect(await accept()).toMatchObject({ status: 409, body: { code: "invoiceChoice", error: expect.stringContaining("онлайн-оплата") } });
    expect(await accept({ seen: "p-new" })).toMatchObject({ status: 200 });
  });
});

describe("DELETE /api/admin/payments/[id]: онлайн-платёж не удаляется", () => {
  const del = () => removePayment(new Request("http://localhost/api/admin/payments/x", { method: "DELETE" }), { params: Promise.resolve({ id: "0d0d0d0d-0000-4000-8000-0000000000b1" }) }).then(async (res) => ({ status: res.status, body: (await res.json()) as { error?: string } }));

  it("Kaspi или карта — 409 «оформите возврат»; ручной — удаляется", async () => {
    let removed = 0;
    payments.remove = async () => void removed++;
    payments.find = async () => ({ id: "p1", dealId: DEAL, method: "kaspi", amount: 5000, paidAt: new Date() });
    expect(await del()).toEqual({ status: 409, body: { error: "Онлайн-платёж не удаляется — оформите возврат" } });
    expect(removed).toBe(0);
    payments.find = async () => ({ id: "p1", dealId: DEAL, method: "manual", amount: 5000, paidAt: new Date() });
    expect(await del()).toMatchObject({ status: 200 });
    expect(removed).toBe(1);
  });
});
