import { formatPrice } from "@/config/site";

/** Хранилище платежей по сделке (infrastructure/payments.ts). */
export interface PaymentStore {
  add(input: { dealId: string; clientId: string | null; amount: number; paidAt?: Date; note?: string; createdById: string }): Promise<IntakePayment>;
  refund(input: { dealId: string; clientId: string | null; amount: number; paidAt?: Date; note: string; createdById: string }): Promise<IntakePayment>;
  paidTotal(dealId: string): Promise<number>;
}

/** Хранилище чеков (infrastructure/receipts.ts): файл и запись о нём. */
export interface ReceiptStore {
  add(input: { dealId: string; clientId: string | null; paymentId?: string | null; bytes: Buffer; fileName: string; amount: number; uploadedById: string }): Promise<IntakeReceipt>;
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
}

/**
 * Принять деньги по сделке, оформленной вручную: платёж (или возврат) с чеком, заметка с суммой и чеком,
 * журнал, письмо клиенту. Платёж без чека не принимается. Деньги сразу попадают в обзор, аналитику и планы.
 */
export class PaymentIntakeService {
  constructor(
    private readonly payments: PaymentStore,
    private readonly receipts: ReceiptStore,
    private readonly effects: PaymentEffects,
  ) {}

  async acceptWithReceipt(input: AcceptInput): Promise<{ payment: IntakePayment; receipt: IntakeReceipt }> {
    const { deal, actor } = input;
    const refund = input.kind === "refund";
    const money = { dealId: deal.id, clientId: deal.clientId, amount: input.amount, paidAt: input.paidAt, note: input.note, createdById: actor.userId };
    const payment = refund ? await this.payments.refund(money) : await this.payments.add(money);
    const receipt = await this.receipts.add({ dealId: deal.id, clientId: deal.clientId, paymentId: payment.id, bytes: input.receipt.bytes, fileName: input.receipt.fileName, amount: payment.amount, uploadedById: actor.userId });
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
}
