import { formatPrice } from "@/config/site";
import type { UnitOfWork } from "@/shared/application";
import { PaymentError } from "../domain";

/** Хранилище платежей по сделке (infrastructure/payments.ts). */
export interface PaymentStore {
  add(input: { dealId: string; clientId: string | null; amount: number; paidAt?: Date; note?: string; createdById: string; invoiceId?: string | null }): Promise<IntakePayment>;
  refund(input: { dealId: string; clientId: string | null; amount: number; paidAt?: Date; note: string; createdById: string }): Promise<IntakePayment>;
  paidTotal(dealId: string): Promise<number>;
  find(id: string): Promise<{ dealId: string } | null>;
}

/** Хранилище чеков (infrastructure/receipts.ts): сначала файл (stage), затем запись о нём (record); discard убирает файл. */
export interface ReceiptStore<S = unknown> {
  stage(input: { dealId: string; bytes: Buffer; fileName: string }): Promise<S>;
  record(staged: S, input: { clientId: string | null; paymentId: string | null; amount: number; uploadedById: string }): Promise<IntakeReceipt>;
  discard(staged: S): Promise<void>;
}

export interface IntakePayment {
  id: string;
  amount: number;
  kind: string;
  note: string;
  paidAt: Date;
}

export interface IntakeReceipt {
  id: string;
  fileName: string;
  amount: number;
  mime: string;
  size: number;
  createdAt: Date;
}

/** Кто принимает деньги — сотрудник CRM, как его видят заметки клиента. */
export interface IntakeActor {
  userId: string;
  name: string;
  seesAll: boolean;
  allTasks: boolean;
}

/**
 * Что сопровождает принятые деньги за пределами продаж: заметка в карточке клиента (clients), письмо клиенту
 * и запись в журнале действий сотрудников (access). Порты собирает container — модули друг друга не знают.
 */
export interface PaymentEffects {
  note(actor: IntakeActor, input: { text: string; dealId: string; clientId: string | null }): Promise<void>;
  mailClient(input: { clientId: string | null; dealNumber: number; kind: "payment" | "refund"; amount: number; left: number }): Promise<void>;
  audit(input: { actorId: string; action: string; entity: string; entityId: string; details: Record<string, unknown> }): Promise<void>;
  /** Перевод по счёту из чата: счёт закрывается оплаченным в той же транзакции (ошибка — деньги не записываются). */
  markInvoicePaid?(input: { invoiceId: string; dealId: string; paymentId: string | null }): Promise<void>;
}

export interface AcceptInput {
  deal: { id: string; clientId: string | null; number: number; amount: number };
  /** Возврат клиенту (причина — в note) или принятый платёж. */
  kind: "payment" | "refund";
  amount: number;
  paidAt: Date;
  note: string;
  /** Чек: скриншот, фото или PDF; уже проверен по размеру и виду. */
  receipt: { bytes: Buffer; fileName: string };
  actor: IntakeActor;
  /** Оплата по счёту из чата (P<n>): счёт этой сделки и ждёт оплаты, сумма — сумма счёта. */
  invoice?: { id: string; amount: number } | null;
}

/**
 * Принять деньги по сделке, оформленной вручную: платёж (или возврат) с чеком, заметка с суммой и чеком,
 * журнал, письмо клиенту. Платёж без чека не принимается. Деньги сразу попадают в обзор, аналитику и планы.
 */
export class PaymentIntakeService<S = unknown> {
  constructor(
    private readonly payments: PaymentStore,
    /** S — черновик чека (файл в хранилище без записи); его вид знает только хранилище. */
    private readonly receipts: ReceiptStore<S>,
    private readonly effects: PaymentEffects,
    private readonly uow: Pick<UnitOfWork, "run">,
  ) {}

  async acceptWithReceipt(input: AcceptInput): Promise<{ payment: IntakePayment; receipt: IntakeReceipt }> {
    const { deal, actor } = input;
    const refund = input.kind === "refund";
    if (input.invoice && (refund || input.invoice.amount !== input.amount)) throw new PaymentError("amount");
    const money = { dealId: deal.id, clientId: deal.clientId, amount: input.amount, paidAt: input.paidAt, note: input.note, createdById: actor.userId, invoiceId: input.invoice?.id ?? null };
    // Платёж без чека невозможен (B4): файл чека — до денег; платёж и запись о чеке — одной транзакцией;
    // не записалось одно из двух — транзакция откатывается, файл убираем.
    const staged = await this.receipts.stage({ dealId: deal.id, bytes: input.receipt.bytes, fileName: input.receipt.fileName });
    let payment: IntakePayment;
    let receipt: IntakeReceipt;
    try {
      ({ payment, receipt } = await this.uow.run(async () => {
        // Счёт — первым (тот же порядок блокировок, что у онлайн-оплаты: счёт → сделка): иначе взаимная блокировка.
        if (input.invoice) {
          if (!this.effects.markInvoicePaid) throw new PaymentError("amount");
          await this.effects.markInvoicePaid({ invoiceId: input.invoice.id, dealId: deal.id, paymentId: null });
        }
        const payment = refund ? await this.payments.refund(money) : await this.payments.add(money);
        const receipt = await this.receipts.record(staged, { clientId: deal.clientId, paymentId: payment.id, amount: payment.amount, uploadedById: actor.userId });
        return { payment, receipt };
      }));
    } catch (err) {
      await this.receipts.discard(staged);
      throw err;
    }
    await this.effects.note(actor, {
      text: refund
        ? `Возврат ${formatPrice(payment.amount)} клиенту: ${payment.note}. Чек: ${receipt.fileName}`
        : `${payment.kind === "prepayment" ? "Предоплата" : "Платёж"} ${formatPrice(payment.amount)} принят(а). Чек: ${receipt.fileName}`,
      dealId: deal.id,
      clientId: deal.clientId,
    });
    await this.effects.audit({ actorId: actor.userId, action: "payment.add", entity: "deal", entityId: deal.id, details: { payment: payment.id, amount: payment.amount, receipt: receipt.id } });
    await this.effects.mailClient({ clientId: deal.clientId, dealNumber: deal.number, kind: refund ? "refund" : "payment", amount: payment.amount, left: Math.max(0, deal.amount - (await this.payments.paidTotal(deal.id))) });
    return { payment, receipt };
  }

  /**
   * Приложить чек к сделке — без денег (форма «Новый клиент» догружает чек к созданному платежу; можно и просто чек).
   * Платёж, если указан, — только этой сделки; иначе null и ничего не записано. Заметка о чеке и запись в журнале.
   */
  async attachReceipt(input: { deal: { id: string; clientId: string | null }; paymentId: string | null; amount: number; receipt: { bytes: Buffer; fileName: string }; actor: IntakeActor }): Promise<IntakeReceipt | null> {
    const { deal, actor } = input;
    if (input.paymentId) {
      const payment = await this.payments.find(input.paymentId);
      if (!payment || payment.dealId !== deal.id) return null;
    }
    const staged = await this.receipts.stage({ dealId: deal.id, bytes: input.receipt.bytes, fileName: input.receipt.fileName });
    let receipt: IntakeReceipt;
    try {
      receipt = await this.receipts.record(staged, { clientId: deal.clientId, paymentId: input.paymentId, amount: input.amount, uploadedById: actor.userId });
    } catch (err) {
      await this.receipts.discard(staged);
      throw err;
    }
    await this.effects.note(actor, { text: `Приложен чек${receipt.amount ? ` на ${formatPrice(receipt.amount)}` : ""}: ${receipt.fileName}`, dealId: deal.id, clientId: deal.clientId });
    await this.effects.audit({ actorId: actor.userId, action: "receipt.add", entity: "deal", entityId: deal.id, details: { receipt: receipt.id, amount: receipt.amount } });
    return receipt;
  }
}
