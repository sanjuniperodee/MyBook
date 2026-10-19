import type { Actor, Clock, UnitOfWork } from "@/shared/application";
import { receiptProblem, safeReceiptName, sniffReceipt } from "@/shared/domain/receipt";
import { ORDER_MONEY_LABELS, OrderingError, type OrderPaymentRecord, type OrderPaymentRepository, type OrderRepository } from "../domain";

/** Файлы чеков заказа в хранилище (orders/<заказ>/payments/<id>.<тип>). */
export interface ReceiptFiles {
  put(key: string, bytes: Buffer): Promise<void>;
  remove(key: string): Promise<void>;
  read(key: string): Promise<Buffer | null>;
}

export interface ManualPaymentInput {
  orderId: string;
  amount: number;
  paidAt: Date;
  note: string;
  /** Чек обязателен: скриншот перевода, фото, PDF до 12 МБ. */
  receipt: { bytes: Buffer; fileName: string };
  actor: Actor & { userId: string };
}

export interface OnlinePaymentInput {
  orderId: string;
  amount: number;
  method: "kaspi" | "cloudpayments";
  /** Операция платёжной системы: повтор той же операции — не новые деньги. */
  externalRef: string;
  /** Как платёж записывается в заказ (orders.payment_id); по умолчанию — операция. */
  paymentId?: string | null;
  paidAt: Date;
}

/** Самая поздняя дата оплаты, которую принимаем: сегодня (дата «из будущего» — опечатка). */
const notInFuture = (paidAt: Date, now: Date) => paidAt.getTime() <= now.getTime() + 60_000;

/**
 * Деньги по заказу — журнал оплат. Перевод принимает сотрудник с чеком в любом статусе заказа, кроме отменённого;
 * онлайн-оплаты записывает платёжная система — по операции, без дублей. Деньги покрыли «к оплате» — заказ оплачен
 * (или постоплата получена); больше — «переплата». Выручка от записи не задваивается: её признаёт сам заказ (paid_at).
 */
export class OrderPaymentsService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly payments: OrderPaymentRepository,
    private readonly files: ReceiptFiles,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  list(orderId: string) {
    return this.payments.list(orderId);
  }

  /** Деньги по заказу для CRM (сделка, финансы): к оплате, получено, постоплата и записи журнала. */
  async summary(orderId: string) {
    const order = await this.orders.findById(orderId);
    if (!order) return null;
    return { due: order.amount, received: order.received, postpay: order.postpay, settled: order.isSettled, rows: await this.payments.list(orderId) };
  }

  async acceptManual(input: ManualPaymentInput): Promise<{ payment: OrderPaymentRecord; settled: boolean; overpaid: number }> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new OrderingError("invalidAmount", "Сумма — целое число больше нуля");
    if (!notInFuture(input.paidAt, this.clock.now())) throw new OrderingError("invalidAmount", "Дата оплаты не может быть в будущем");
    const problem = receiptProblem(input.receipt.bytes);
    const type = sniffReceipt(input.receipt.bytes);
    if (problem || !type) throw new OrderingError("receiptInvalid", problem ?? "type");
    const id = this.payments.nextId();
    const storageKey = `orders/${input.orderId}/payments/${id}.${type.ext}`;
    // Чек — до денег: без чека оплата не записывается; не записалась — файл убираем.
    await this.files.put(storageKey, input.receipt.bytes);
    try {
      return await this.uow.run(async () => {
        const order = await this.orders.lockById(input.orderId);
        if (!order) throw new OrderingError("orderNotFound");
        const receipt = { storageKey, fileName: safeReceiptName(input.receipt.fileName, type.ext), mime: type.mime, size: input.receipt.bytes.length };
        const record = { id, orderId: order.id, amount: input.amount, method: "manual" as const, externalRef: null, paidAt: input.paidAt, note: input.note.trim().slice(0, 500), receipt, createdById: input.actor.userId };
        const result = order.receiveMoney({ paymentId: `manual:${id}`, amount: input.amount, method: "manual", paidAt: input.paidAt, label: `${ORDER_MONEY_LABELS.manual}, чек ${receipt.fileName}${record.note ? ` — ${record.note}` : ""}`, actor: input.actor.label });
        await this.payments.add(record);
        await this.orders.save(order);
        this.uow.track(order);
        return { payment: { ...record, reviewedById: null, reviewedAt: null, createdAt: this.clock.now() }, ...result };
      });
    } catch (err) {
      await this.files.remove(storageKey).catch(() => {});
      throw err;
    }
  }

  /** Онлайн-оплата (вебхук или сверка): "recorded" — деньги записаны, "duplicate" — эта операция уже была. */
  async recordOnline(input: OnlinePaymentInput, actor: Actor): Promise<{ status: "recorded" | "duplicate" | "notFound"; settled: boolean; overpaid: number }> {
    return this.uow.run(async () => {
      const order = await this.orders.lockById(input.orderId);
      if (!order) return { status: "notFound" as const, settled: false, overpaid: 0 };
      const id = this.payments.nextId();
      const added = await this.payments.add({ id, orderId: order.id, amount: input.amount, method: input.method, externalRef: input.externalRef, paidAt: input.paidAt, note: "", receipt: null, createdById: null });
      if (!added) return { status: "duplicate" as const, settled: false, overpaid: 0 };
      const result = order.receiveMoney({ paymentId: input.paymentId ?? input.externalRef, amount: input.amount, method: input.method, paidAt: input.paidAt, label: `${ORDER_MONEY_LABELS[input.method]}, операция ${input.externalRef}`, actor: actor.label });
      await this.orders.save(order);
      this.uow.track(order);
      return { status: "recorded" as const, ...result };
    });
  }

  /** Руководитель сверил ручную оплату с выпиской. */
  async review(paymentId: string, reviewerId: string) {
    const p = await this.payments.find(paymentId);
    if (!p || p.method !== "manual" || p.reviewedAt) return null;
    await this.payments.review(p.id, reviewerId, this.clock.now());
    return p;
  }

  async receipt(paymentId: string) {
    const p = await this.payments.find(paymentId);
    if (!p?.receipt) return null;
    const bytes = await this.files.read(p.receipt.storageKey);
    return bytes ? { payment: p, bytes } : null;
  }

  /** Постоплата: в печать без оплаты, с причиной. */
  async startPostpay(orderId: string, reason: string, actor: Actor) {
    return this.uow.run(async () => {
      const order = await this.orders.lockById(orderId);
      if (!order) throw new OrderingError("orderNotFound");
      order.startPostpay(reason.trim().slice(0, 200), actor.label, this.clock.now());
      await this.orders.save(order);
      this.uow.track(order);
      return order;
    });
  }
}
