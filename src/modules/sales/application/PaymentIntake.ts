import { formatPrice } from "@/config/site";
import type { Logger, UnitOfWork } from "@/shared/application";
import { PaymentError } from "../domain";

/** Хранилище платежей по сделке (infrastructure/payments.ts). */
export interface PaymentStore {
  /** requestKey — ключ отправки формы: тот же ключ повторно — уже записанный платёж с repeated (под блокировкой сделки). */
  add(input: { dealId: string; clientId: string | null; amount: number; paidAt?: Date; note?: string; createdById: string; invoiceId?: string | null; payForm?: string | null; requestKey?: string | null }): Promise<IntakePayment & { repeated: boolean }>;
  refund(input: { dealId: string; clientId: string | null; amount: number; paidAt?: Date; note: string; createdById: string; payForm?: string | null; requestKey?: string | null }): Promise<IntakePayment & { repeated: boolean }>;
  findByRequestKey(key: string): Promise<(IntakePayment & { dealId: string }) | null>;
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
  /** Сделка оплачена полностью (остатка нет): задачи «Получить остаток …» больше не нужны. */
  paidUp?(input: { dealId: string }): Promise<void>;
}

export interface AcceptInput {
  deal: { id: string; clientId: string | null; number: number; amount: number };
  /** Возврат клиенту (причина — в note) или принятый платёж. */
  kind: "payment" | "refund";
  amount: number;
  paidAt: Date;
  note: string;
  /** Форма оплаты (Kaspi Gold, Kaspi Рассрочка, Kaspi Red…): по ней — комиссия банка с этого платежа. Пусто — форма сделки. */
  payForm?: string | null;
  /** Чек: скриншот, фото или PDF; уже проверен по размеру и виду. */
  receipt: { bytes: Buffer; fileName: string };
  actor: IntakeActor;
  /** Оплата по счёту из чата (P<n>): счёт этой сделки и ждёт оплаты, сумма — сумма счёта. */
  invoice?: { id: string; amount: number } | null;
  /** Ключ отправки формы: повтор той же отправки (сбой письма, журнала, сети) — уже записанный платёж, без второго. */
  requestKey?: string | null;
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
    private readonly logger?: Logger,
  ) {}

  /**
   * Заметка, журнал и письмо — после записи денег: деньги уже в базе, поэтому их сбой не превращается в ошибку для
   * сотрудника (иначе он отправит форму ещё раз). Ошибка — в лог.
   */
  private async after(what: string, dealId: string, work: () => Promise<unknown>) {
    try {
      await work();
    } catch (err) {
      (this.logger?.error ?? console.error)(`деньги по сделке записаны, ${what} — нет`, err, { dealId });
    }
  }

  /**
   * Принять деньги. receipt — null, если это повтор той же отправки формы (requestKey): деньги и чек записала первая,
   * заметка, журнал и письмо — тоже; repeated: true.
   */
  async acceptWithReceipt(input: AcceptInput): Promise<{ payment: IntakePayment; receipt: IntakeReceipt | null; repeated: boolean }> {
    const { deal, actor } = input;
    const refund = input.kind === "refund";
    if (input.invoice && (refund || input.invoice.amount !== input.amount)) throw new PaymentError("amount");
    // Повтор той же отправки — до чека: иначе проверка повтора чека отказала бы «чек уже приложен» к своему же платежу.
    if (input.requestKey) {
      const before = await this.payments.findByRequestKey(input.requestKey);
      if (before && before.dealId !== deal.id) throw new PaymentError("amount");
      if (before) return { payment: before, receipt: null, repeated: true };
    }
    const money = { dealId: deal.id, clientId: deal.clientId, amount: input.amount, paidAt: input.paidAt, note: input.note, createdById: actor.userId, invoiceId: input.invoice?.id ?? null, payForm: input.payForm ?? null, requestKey: input.requestKey ?? null };
    // Платёж без чека невозможен (B4): файл чека — до денег; платёж и запись о чеке — одной транзакцией;
    // не записалось одно из двух — транзакция откатывается, файл убираем.
    const staged = await this.receipts.stage({ dealId: deal.id, bytes: input.receipt.bytes, fileName: input.receipt.fileName });
    let payment: IntakePayment & { repeated: boolean };
    let receipt: IntakeReceipt | null;
    try {
      ({ payment, receipt } = await this.uow.run(async () => {
        // Двойное нажатие: вторая отправка ждала блокировку сделки — видит первую до счёта и чека, ничего не пишет.
        if (input.requestKey) {
          const twin = await this.payments.findByRequestKey(input.requestKey);
          if (twin) return { payment: { ...twin, repeated: true }, receipt: null };
        }
        // Счёт — первым (тот же порядок блокировок, что у онлайн-оплаты: счёт → сделка): иначе взаимная блокировка.
        if (input.invoice) {
          if (!this.effects.markInvoicePaid) throw new PaymentError("amount");
          await this.effects.markInvoicePaid({ invoiceId: input.invoice.id, dealId: deal.id, paymentId: null });
        }
        const payment = refund ? await this.payments.refund(money) : await this.payments.add(money);
        if (payment.repeated) return { payment, receipt: null };
        const receipt = await this.receipts.record(staged, { clientId: deal.clientId, paymentId: payment.id, amount: payment.amount, uploadedById: actor.userId });
        return { payment, receipt };
      }));
    } catch (err) {
      await this.receipts.discard(staged);
      throw err;
    }
    if (!receipt) {
      await this.receipts.discard(staged);
      return { payment, receipt: null, repeated: true };
    }
    const saved = receipt;
    await this.after("заметка", deal.id, () => this.effects.note(actor, {
      text: refund
        ? `Возврат ${formatPrice(payment.amount)} клиенту: ${payment.note}. Чек: ${receipt.fileName}`
        : `${payment.kind === "prepayment" ? "Предоплата" : "Платёж"} ${formatPrice(payment.amount)} принят(а). Чек: ${receipt.fileName}`,
      dealId: deal.id,
      clientId: deal.clientId,
    }));
    await this.after("журнал", deal.id, () => this.effects.audit({ actorId: actor.userId, action: "payment.add", entity: "deal", entityId: deal.id, details: { payment: payment.id, amount: payment.amount, receipt: saved.id } }));
    const left = Math.max(0, deal.amount - (await this.payments.paidTotal(deal.id)));
    await this.after("письмо клиенту", deal.id, async () => this.effects.mailClient({ clientId: deal.clientId, dealNumber: deal.number, kind: refund ? "refund" : "payment", amount: payment.amount, left }));
    if (!refund && left === 0 && deal.amount > 0 && this.effects.paidUp) await this.after("задача остатка", deal.id, () => this.effects.paidUp!({ dealId: deal.id }));
    return { payment, receipt, repeated: false };
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
