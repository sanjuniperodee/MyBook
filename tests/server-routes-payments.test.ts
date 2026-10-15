import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentError, ReceiptError, RECEIPT_MAX_BYTES } from "@/modules/sales";
import { POST as acceptPayment } from "@/app/api/admin/deals/[id]/payments/route";
import { POST as attachReceipt } from "@/app/api/admin/deals/[id]/receipts/route";
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

beforeEach(() => {
  resetRequest();
  resetContainer();
  signIn(owner);
  deal = { id: DEAL, clientId: "c1", assigneeId: null, orderId: null, number: 7, amount: 100_000 };
  payments = { add: async () => ({ id: "p1", amount: 5000, kind: "payment", paidAt: new Date(), note: "" }), find: async () => ({ id: "p1", dealId: DEAL }) };
  receipts = { add: async () => ({ id: "r1", fileName: "чек.pdf", amount: 5000, mime: "application/pdf", size: 8, createdAt: new Date() }) };
  fake.sales = { deals: { findById: async () => deal }, payments, receipts };
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

  it("платёж другой сделки — 400 «Платёж не найден»; ReceiptError — текст по причине", async () => {
    payments.find = async () => ({ id: "p9", dealId: "other" });
    expect(await attach({ paymentId: "p9" })).toMatchObject({ status: 400, body: { error: "Платёж не найден" } });
    payments.find = async () => null;
    expect(await attach({ paymentId: "p9" })).toMatchObject({ status: 400, body: { error: "Платёж не найден" } });
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
