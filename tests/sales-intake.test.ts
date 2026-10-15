import { describe, expect, it } from "vitest";
import { formatPrice } from "@/config/site";
import { PaymentIntakeService, type IntakePayment, type PaymentStore, type ReceiptStore } from "@/modules/sales/application";
import { ReceiptError } from "@/modules/sales/domain";

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
  };
  const receipts: ReceiptStore & { fail?: boolean } = {
    add: async (r) => {
      if (receipts.fail) throw new ReceiptError("type");
      files.push(r.fileName);
      log.push(`receipt ${r.fileName} → ${r.paymentId}`);
      return { id: "rec-1", fileName: r.fileName };
    },
  };
  const service = new PaymentIntakeService(payments, receipts, {
    note: async (_a, n) => void log.push(`note ${n.text}`),
    audit: async (a) => void log.push(`audit ${a.action} ${JSON.stringify(a.details)}`),
    mailClient: async (m) => void log.push(`mail ${m.kind} ${m.amount} left ${m.left}`),
  });
  return { log, paid, files, receipts, service };
}

const actor = { userId: "m1", name: "Айгерим", seesAll: false, allTasks: false };
const deal = { id: "deal-1", clientId: "client-1", number: 7, amount: 30_000 };
const receipt = { bytes: Buffer.from("%PDF-1.4"), fileName: "чек.pdf" };

describe("PaymentIntakeService.acceptWithReceipt (E2)", () => {
  it("платёж → чек к нему → заметка → журнал → письмо с остатком", async () => {
    const { log, service } = harness();
    await service.acceptWithReceipt({ deal, kind: "payment", amount: 10_000, paidAt: new Date(), note: "", receipt, actor });
    expect(log).toEqual([
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
    expect(log[0]).toBe("refund 4000");
    expect(log).toContain(`note Возврат ${formatPrice(4_000)} клиенту: отказ от допов. Чек: чек.pdf`);
    expect(log.at(-1)).toBe("mail refund 4000 left 24000");
  });

  it("баг (B4): чек не сохранился — платёж уже записан, деньги в выручке без чека", async () => {
    const { paid, receipts, service } = harness();
    receipts.fail = true;
    await expect(service.acceptWithReceipt({ deal, kind: "payment", amount: 10_000, paidAt: new Date(), note: "", receipt, actor })).rejects.toThrow(ReceiptError);
    expect(paid).toHaveLength(1);
  });
});
