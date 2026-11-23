import { describe, expect, it } from "vitest";
import { formatPrice } from "@/config/site";
import { PaymentIntakeService, type IntakePayment, type PaymentStore, type ReceiptStore } from "@/modules/sales/application";
import { PaymentError, ReceiptError } from "@/modules/sales/domain";

/** Платежи и чеки в памяти; журнал шагов — общий. */
function harness() {
  const log: string[] = [];
  const paid: (IntakePayment & { requestKey?: string | null })[] = [];
  const files: string[] = [];
  /** Транзакция: ошибка внутри — платежи возвращаются к состоянию до неё. */
  const uow = {
    run: async <T>(work: () => Promise<T>) => {
      const before = paid.length;
      try {
        return await work();
      } catch (err) {
        paid.splice(before);
        log.push("rollback");
        throw err;
      }
    },
  };
  const payments: PaymentStore = {
    add: async (p) => {
      const twin = p.requestKey && paid.find((x) => x.requestKey === p.requestKey);
      if (twin) return { ...twin, repeated: true };
      const row = { id: `pay-${paid.length + 1}`, amount: p.amount, kind: paid.length ? "payment" : "prepayment", note: p.note ?? "", paidAt: p.paidAt ?? new Date(), requestKey: p.requestKey };
      paid.push(row);
      log.push(`payment ${row.kind} ${row.amount}`);
      return { ...row, repeated: false };
    },
    refund: async (p) => {
      const row = { id: `pay-${paid.length + 1}`, amount: p.amount, kind: "refund", note: p.note, paidAt: p.paidAt ?? new Date(), requestKey: p.requestKey };
      paid.push(row);
      log.push(`refund ${row.amount}`);
      return { ...row, repeated: false };
    },
    findByRequestKey: async (key) => {
      const row = paid.find((x) => x.requestKey === key);
      return row ? { ...row, dealId: "deal-1" } : null;
    },
    paidTotal: async () => paid.reduce((s, p) => s + (p.kind === "refund" ? -p.amount : p.amount), 0),
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
  const effects = {
    failAudit: false,
    note: async (_a: unknown, n: { text: string }) => void log.push(`note ${n.text}`),
    audit: async (a: { action: string; details: unknown }) => {
      if (effects.failAudit) throw new Error("журнал недоступен");
      log.push(`audit ${a.action} ${JSON.stringify(a.details)}`);
    },
    mailClient: async (m: { kind: string; amount: number; left: number }) => void log.push(`mail ${m.kind} ${m.amount} left ${m.left}`),
  };
  const errors: string[] = [];
  const logger = { info: () => {}, warn: () => {}, error: (m: string) => void errors.push(m) };
  const service = new PaymentIntakeService(payments, receipts, effects, uow, logger);
  return { log, paid, files, payments, receipts, service, effects, errors };
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
    expect(log).toEqual(["stage чек.pdf", "payment prepayment 10000", "rollback", "discard чек.pdf"]);
  });

  it("B4: платёж не записался (сумма, дата) — файл чека убирается", async () => {
    const { log, files, payments, service } = harness();
    payments.add = async () => Promise.reject(new PaymentError("amount"));
    await expect(service.acceptWithReceipt({ deal, kind: "payment", amount: 0, paidAt: new Date(), note: "", receipt, actor })).rejects.toThrow(PaymentError);
    expect(files).toEqual([]);
    expect(log).toEqual(["stage чек.pdf", "rollback", "discard чек.pdf"]);
  });

  it("B4: файл чека негоден — денег не трогаем", async () => {
    const { paid } = harness();
    const bad = new PaymentIntakeService(
      { add: async () => (paid.push({ id: "x", amount: 1, kind: "payment", note: "", paidAt: new Date() }), { ...paid[0], repeated: false }), refund: async () => ({ ...paid[0], repeated: false }), paidTotal: async () => 0, find: async () => null, findByRequestKey: async () => null },
      { stage: async () => Promise.reject(new ReceiptError("type")), record: async () => ({ id: "r", fileName: "f", amount: 0, mime: "", size: 0, createdAt: new Date() }), discard: async () => {} },
      { note: async () => {}, audit: async () => {}, mailClient: async () => {} },
      { run: (work) => work() },
    );
    await expect(bad.acceptWithReceipt({ deal, kind: "payment", amount: 10_000, paidAt: new Date(), note: "", receipt, actor })).rejects.toThrow(ReceiptError);
    expect(paid).toEqual([]);
  });
});

describe("PaymentIntakeService: повтор отправки формы", () => {
  it("журнал упал после записи денег — платёж всё равно принят (без ошибки), сбой в логе; заметка и письмо есть", async () => {
    const { log, paid, service, effects, errors } = harness();
    effects.failAudit = true;
    const r = await service.acceptWithReceipt({ deal, kind: "payment", amount: 10_000, paidAt: new Date(), note: "", receipt, actor, requestKey: "k-1" });
    expect(r.repeated).toBe(false);
    expect(paid).toHaveLength(1);
    expect(errors).toEqual(["деньги по сделке записаны, журнал — нет"]);
    expect(log.at(-1)).toBe("mail payment 10000 left 20000");
  });

  it("та же отправка ещё раз (тот же ключ) — тот же платёж: ни второго платежа, ни чека, ни письма", async () => {
    const { log, paid, files, service } = harness();
    const first = await service.acceptWithReceipt({ deal, kind: "payment", amount: 10_000, paidAt: new Date(), note: "", receipt, actor, requestKey: "k-1" });
    log.length = 0;
    const again = await service.acceptWithReceipt({ deal, kind: "payment", amount: 10_000, paidAt: new Date(), note: "", receipt, actor, requestKey: "k-1" });
    expect(again).toMatchObject({ repeated: true, receipt: null, payment: { id: first.payment.id } });
    expect([paid.length, files.length, log]).toEqual([1, 1, []]);
    // Новая отправка формы (новый ключ) — новый платёж.
    await service.acceptWithReceipt({ deal, kind: "payment", amount: 5_000, paidAt: new Date(), note: "", receipt, actor, requestKey: "k-2" });
    expect(paid.map((p) => p.amount)).toEqual([10_000, 5_000]);
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
