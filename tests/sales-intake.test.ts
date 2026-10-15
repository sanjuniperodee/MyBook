import { describe, expect, it } from "vitest";
import { formatPrice } from "@/config/site";
import { PaymentIntakeService, type IntakePayment, type PaymentStore, type ReceiptStore } from "@/modules/sales/application";
import { PaymentError, ReceiptError } from "@/modules/sales/domain";

/** Платежи и чеки в памяти; журнал шагов — общий. */
function harness() {
  const log: string[] = [];
  const paid: IntakePayment[] = [];
  const files: string[] = [];
  const payments: PaymentStore = {
    add: async (p) => {
      const row = { id: `pay-${paid.length + 1}`, amount: p.amount, kind: paid.length ? "payment" : "prepayment", note: p.note ?? "", paidAt: p.paidAt ?? new Date() };
      paid.push(row);
      log.push(`payment ${row.kind} ${row.amount}`);
      return row;
    },
    refund: async (p) => {
      const row = { id: `pay-${paid.length + 1}`, amount: p.amount, kind: "refund", note: p.note, paidAt: p.paidAt ?? new Date() };
      paid.push(row);
      log.push(`refund ${row.amount}`);
      return row;
    },
    paidTotal: async () => paid.reduce((s, p) => s + (p.kind === "refund" ? -p.amount : p.amount), 0),
    remove: async (id) => {
      paid.splice(paid.findIndex((p) => p.id === id), 1);
      log.push(`remove ${id}`);
    },
    find: async (id) => (paid.some((p) => p.id === id) ? { dealId: "deal-1" } : null),
  };
  const receipts: ReceiptStore<string> & { failRecord?: boolean } = {
    stage: async (r) => {
      files.push(r.fileName);
      log.push(`stage ${r.fileName}`);
      return r.fileName;
    },
    record: async (name, r) => {
      if (receipts.failRecord) throw new Error("база недоступна");
      log.push(`receipt ${name} → ${r.paymentId}`);
      return { id: "rec-1", fileName: name, amount: r.amount, mime: "application/pdf", size: 8, createdAt: new Date() };
    },
    discard: async (name) => {
      files.splice(files.indexOf(name), 1);
      log.push(`discard ${name}`);
    },
  };
  const service = new PaymentIntakeService(payments, receipts, {
    note: async (_a, n) => void log.push(`note ${n.text}`),
    audit: async (a) => void log.push(`audit ${a.action} ${JSON.stringify(a.details)}`),
    mailClient: async (m) => void log.push(`mail ${m.kind} ${m.amount} left ${m.left}`),
  });
  return { log, paid, files, payments, receipts, service };
}

const actor = { userId: "m1", name: "Айгерим", seesAll: false, allTasks: false };
const deal = { id: "deal-1", clientId: "client-1", number: 7, amount: 30_000 };
const receipt = { bytes: Buffer.from("%PDF-1.4"), fileName: "чек.pdf" };

describe("PaymentIntakeService.acceptWithReceipt (E2)", () => {
  it("платёж → чек к нему → заметка → журнал → письмо с остатком", async () => {
    const { log, service } = harness();
    await service.acceptWithReceipt({ deal, kind: "payment", amount: 10_000, paidAt: new Date(), note: "", receipt, actor });
    expect(log).toEqual([
      "stage чек.pdf",
      "payment prepayment 10000",
      "receipt чек.pdf → pay-1",
      `note Предоплата ${formatPrice(10_000)} принят(а). Чек: чек.pdf`,
      'audit payment.add {"payment":"pay-1","amount":10000,"receipt":"rec-1"}',
      "mail payment 10000 left 20000",
    ]);
  });

  it("возврат — с причиной в заметке и письмом о возврате", async () => {
    const { log, service } = harness();
    await service.acceptWithReceipt({ deal, kind: "payment", amount: 10_000, paidAt: new Date(), note: "", receipt, actor });
    log.length = 0;
    await service.acceptWithReceipt({ deal, kind: "refund", amount: 4_000, paidAt: new Date(), note: "отказ от допов", receipt, actor });
    expect(log.slice(0, 2)).toEqual(["stage чек.pdf", "refund 4000"]);
    expect(log).toContain(`note Возврат ${formatPrice(4_000)} клиенту: отказ от допов. Чек: чек.pdf`);
    expect(log.at(-1)).toBe("mail refund 4000 left 24000");
  });

  it("B4: запись чека не удалась — платёж откатывается, файл убирается; ни заметки, ни письма", async () => {
    const { log, paid, files, receipts, service } = harness();
    receipts.failRecord = true;
    await expect(service.acceptWithReceipt({ deal, kind: "payment", amount: 10_000, paidAt: new Date(), note: "", receipt, actor })).rejects.toThrow("база недоступна");
    expect(paid).toEqual([]);
    expect(files).toEqual([]);
    expect(log).toEqual(["stage чек.pdf", "payment prepayment 10000", "remove pay-1", "discard чек.pdf"]);
  });

  it("B4: платёж не записался (сумма, дата) — файл чека убирается", async () => {
    const { log, files, payments, service } = harness();
    payments.add = async () => Promise.reject(new PaymentError("amount"));
    await expect(service.acceptWithReceipt({ deal, kind: "payment", amount: 0, paidAt: new Date(), note: "", receipt, actor })).rejects.toThrow(PaymentError);
    expect(files).toEqual([]);
    expect(log).toEqual(["stage чек.pdf", "discard чек.pdf"]);
  });

  it("B4: файл чека негоден — денег не трогаем", async () => {
    const { paid } = harness();
    const bad = new PaymentIntakeService(
      { add: async () => (paid.push({ id: "x", amount: 1, kind: "payment", note: "", paidAt: new Date() }), paid[0]), refund: async () => paid[0], paidTotal: async () => 0, remove: async () => {}, find: async () => null },
      { stage: async () => Promise.reject(new ReceiptError("type")), record: async () => ({ id: "r", fileName: "f", amount: 0, mime: "", size: 0, createdAt: new Date() }), discard: async () => {} },
      { note: async () => {}, audit: async () => {}, mailClient: async () => {} },
    );
    await expect(bad.acceptWithReceipt({ deal, kind: "payment", amount: 10_000, paidAt: new Date(), note: "", receipt, actor })).rejects.toThrow(ReceiptError);
    expect(paid).toEqual([]);
  });
});

describe("PaymentIntakeService.attachReceipt (E2)", () => {
  it("чек без платежа: файл и запись, заметка с суммой, журнал; письма нет", async () => {
    const { log, service } = harness();
    const row = await service.attachReceipt({ deal, paymentId: null, amount: 5_000, receipt, actor });
    expect(row).toMatchObject({ id: "rec-1", amount: 5_000 });
    expect(log).toEqual(["stage чек.pdf", "receipt чек.pdf → null", `note Приложен чек на ${formatPrice(5_000)}: чек.pdf`, 'audit receipt.add {"receipt":"rec-1","amount":5000}']);
  });

  it("к платежу этой сделки — привязан; к чужому или несуществующему — null и ничего не записано", async () => {
    const { log, service, payments } = harness();
    const pay = await payments.add({ dealId: deal.id, clientId: deal.clientId, amount: 10_000, createdById: "m1" });
    log.length = 0;
    expect(await service.attachReceipt({ deal: { id: "deal-2", clientId: null }, paymentId: pay.id, amount: 0, receipt, actor })).toBeNull();
    expect(await service.attachReceipt({ deal, paymentId: "pay-99", amount: 0, receipt, actor })).toBeNull();
    expect(log).toEqual([]);
    await service.attachReceipt({ deal, paymentId: pay.id, amount: 0, receipt, actor });
    expect(log.slice(0, 3)).toEqual(["stage чек.pdf", `receipt чек.pdf → ${pay.id}`, "note Приложен чек: чек.pdf"]);
  });

  it("запись чека не удалась — файл убирается, заметки нет", async () => {
    const { log, files, receipts, service } = harness();
    receipts.failRecord = true;
    await expect(service.attachReceipt({ deal, paymentId: null, amount: 0, receipt, actor })).rejects.toThrow("база недоступна");
    expect(files).toEqual([]);
    expect(log).toEqual(["stage чек.pdf", "discard чек.pdf"]);
  });
});
