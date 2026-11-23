import type { Actor, Clock, UnitOfWork } from "@/shared/application";
import { storeTimeZone } from "@/shared/domain/time";
import { receiptProblem, receiptUsedText, safeReceiptName, sniffReceipt, type ReceiptCheck } from "@/shared/domain/receipt";
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
  /** Форма оплаты (Kaspi Gold, Kaspi Рассрочка, Kaspi Red…): по ней — комиссия банка. Пусто — форма сделки. */
  payForm?: string | null;
  /** Чек обязателен: скриншот перевода, фото, PDF до 12 МБ. */
  receipt: { bytes: Buffer; fileName: string };
  /** Ключ отправки формы: повтор той же отправки (сбой письма, журнала, сети) возвращает уже записанный платёж. */
  requestKey?: string | null;
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

export interface RefundInput {
  orderId: string;
  amount: number;
  /** Причина — в журнал заказа и в «Проверить» (от 3 символов). */
  note: string;
  /** Чек перевода клиенту — по желанию: скриншот, фото, PDF до 12 МБ. */
  receipt?: { bytes: Buffer; fileName: string } | null;
  /** Когда вернули; по умолчанию — сейчас. */
  paidAt?: Date;
  /** Ключ отправки формы: повтор той же отправки возвращает уже записанный возврат. */
  requestKey?: string | null;
  actor: Actor & { userId: string };
}

export interface VoidPaymentInput {
  paymentId: string;
  /**
   * Ещё записи того же заказа той же причиной — одной операцией (фиктивная пара «платёж + возврат»): заказ пересчитывается
   * по итогу, без промежуточной «переплаты» или «ждёт доплату».
   */
  also?: string[];
  /** Причина — в журнал заказа, журнал оплат и журнал действий (от 3 символов). */
  reason: string;
  /** userId null — сверка скриптом по поручению владельца (кто — в причине и журнале действий). */
  actor: Actor & { userId: string | null };
}

/** Чек не проверяем на повтор (тесты, скрипты без базы): хэш пустой, совпадений нет. */
const noReceiptCheck: ReceiptCheck = async () => ({ sha256: "", use: null });

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
    /** Хэш чека и где он уже приложен: один перевод — один платёж (фиктивную «доплату» тем же чеком не записать). */
    private readonly checkReceipt: ReceiptCheck = noReceiptCheck,
  ) {}

  /**
   * Чек уже приложен к платежу этой же покупки или чужого клиента — отказ с тем, к какому; к другой сделке того же клиента
   * (один перевод за пакет книг) — можно. Иначе хэш для записи.
   */
  private async receiptHash(bytes: Buffer, orderId: string): Promise<string | null> {
    const { sha256, use } = await this.checkReceipt(bytes, { orderId });
    if (use) throw new OrderingError("paymentRule", receiptUsedText(use));
    return sha256 || null;
  }

  /**
   * Эта отправка формы уже записана (повтор после сбоя письма, журнала или сети): тот же платёж, второй раз денег нет.
   * Ключ другого заказа — не повтор, а ошибка формы.
   */
  private async sent(key: string | null | undefined, orderId: string) {
    if (!key) return null;
    const p = await this.payments.findByRequestKey(key);
    if (p && p.orderId !== orderId) throw new OrderingError("paymentRule", "Эта форма уже отправлена по другому заказу — обновите страницу");
    return p;
  }

  list(orderId: string) {
    return this.payments.list(orderId);
  }

  /** Формы оплаты онлайн-платежей Kaspi по операциям (из истории кассы) — только тем, у кого формы нет; заказы отмеченных. */
  tagKaspiForms(forms: Record<string, string>) {
    return this.payments.tagKaspiForms(forms);
  }

  /** Деньги по заказу для CRM (сделка, финансы): к оплате, получено, постоплата и записи журнала. */
  async summary(orderId: string) {
    const order = await this.orders.findById(orderId);
    if (!order) return null;
    return { due: order.amount, received: order.received, refundable: order.refundable, postpay: order.postpay, settled: order.isSettled, rows: await this.payments.list(orderId) };
  }

  async acceptManual(input: ManualPaymentInput): Promise<{ payment: OrderPaymentRecord; settled: boolean; overpaid: number; repeated: boolean }> {
    // Повтор той же отправки — до проверки чека: иначе «этот чек уже приложен» к собственному платежу.
    const before = await this.sent(input.requestKey, input.orderId);
    if (before) return { payment: before, settled: (await this.orders.findById(input.orderId))?.isSettled ?? false, overpaid: 0, repeated: true };
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new OrderingError("invalidAmount", "Сумма — целое число больше нуля");
    if (!notInFuture(input.paidAt, this.clock.now())) throw new OrderingError("invalidAmount", "Дата оплаты не может быть в будущем");
    const problem = receiptProblem(input.receipt.bytes);
    const type = sniffReceipt(input.receipt.bytes);
    if (problem || !type) throw new OrderingError("receiptInvalid", problem ?? "type");
    const sha256 = await this.receiptHash(input.receipt.bytes, input.orderId);
    const id = this.payments.nextId();
    const storageKey = `orders/${input.orderId}/payments/${id}.${type.ext}`;
    // Чек — до денег: без чека оплата не записывается; не записалась — файл убираем.
    await this.files.put(storageKey, input.receipt.bytes);
    try {
      const out = await this.uow.run(async () => {
        const order = await this.orders.lockById(input.orderId);
        if (!order) throw new OrderingError("orderNotFound");
        // Двойное нажатие: обе отправки прошли проверку выше, вторая ждала блокировку заказа — теперь видит первую.
        const twin = await this.sent(input.requestKey, order.id);
        if (twin) return { payment: twin, settled: order.isSettled, overpaid: 0, repeated: true };
        const receipt = { storageKey, fileName: safeReceiptName(input.receipt.fileName, type.ext), mime: type.mime, size: input.receipt.bytes.length, sha256 };
        const record = { id, orderId: order.id, kind: "payment" as const, amount: input.amount, method: "manual" as const, externalRef: null, payForm: input.payForm ?? null, paidAt: input.paidAt, note: input.note.trim().slice(0, 500), receipt, requestKey: input.requestKey ?? null, createdById: input.actor.userId };
        const result = order.receiveMoney({ paymentId: `manual:${id}`, amount: input.amount, method: "manual", paidAt: input.paidAt, label: `${ORDER_MONEY_LABELS.manual}, чек ${receipt.fileName}${record.note ? ` — ${record.note}` : ""}`, actor: input.actor.label });
        await this.payments.add(record);
        await this.orders.save(order);
        this.uow.track(order);
        return { payment: { ...record, reviewedById: null, reviewedAt: null, createdAt: this.clock.now() }, ...result, repeated: false };
      });
      if (out.repeated) await this.files.remove(storageKey).catch(() => {});
      return out;
    } catch (err) {
      await this.files.remove(storageKey).catch(() => {});
      throw err;
    }
  }

  /**
   * Возврат клиенту переводом: запись refund в журнале денег заказа (с чеком или без) и строка в журнале заказа. Сумма —
   * не больше Order.refundable (по отменённому — всё полученное, по живому — только переплата); проверка и запись — под
   * блокировкой заказа, чтобы два возврата одновременно не вернули больше полученного. Ручной возврат попадает в
   * «Финансы» → «Проверить», как ручная оплата.
   */
  async refund(input: RefundInput): Promise<{ payment: OrderPaymentRecord; refundable: number; repeated: boolean }> {
    const before = await this.sent(input.requestKey, input.orderId);
    if (before) return { payment: before, refundable: (await this.orders.findById(input.orderId))?.refundable ?? 0, repeated: true };
    const note = input.note.trim().slice(0, 500);
    if (note.length < 3) throw new OrderingError("paymentRule", "Укажите причину возврата");
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new OrderingError("paymentRule", "Сумма возврата — целое число тенге больше нуля");
    const now = this.clock.now();
    const paidAt = input.paidAt ?? now;
    if (!notInFuture(paidAt, now)) throw new OrderingError("invalidAmount", "Дата возврата не может быть в будущем");
    const id = this.payments.nextId();
    let receipt: OrderPaymentRecord["receipt"] = null;
    if (input.receipt) {
      const problem = receiptProblem(input.receipt.bytes);
      const type = sniffReceipt(input.receipt.bytes);
      if (problem || !type) throw new OrderingError("receiptInvalid", problem ?? "type");
      const sha256 = await this.receiptHash(input.receipt.bytes, input.orderId);
      receipt = { storageKey: `orders/${input.orderId}/payments/${id}.${type.ext}`, fileName: safeReceiptName(input.receipt.fileName, type.ext), mime: type.mime, size: input.receipt.bytes.length, sha256 };
      await this.files.put(receipt.storageKey, input.receipt.bytes);
    }
    try {
      const out = await this.uow.run(async () => {
        const order = await this.orders.lockById(input.orderId);
        if (!order) throw new OrderingError("orderNotFound");
        const twin = await this.sent(input.requestKey, order.id);
        if (twin) return { payment: twin, refundable: order.refundable, repeated: true };
        const record = { id, orderId: order.id, kind: "refund" as const, amount: input.amount, method: "manual" as const, externalRef: null, paidAt, note, receipt, requestKey: input.requestKey ?? null, createdById: input.actor.userId };
        const result = order.refundMoney({ amount: input.amount, paidAt, label: `${ORDER_MONEY_LABELS.manual}${receipt ? `, чек ${receipt.fileName}` : ", без чека"}`, reason: note, actor: input.actor.label });
        await this.payments.add(record);
        await this.orders.save(order);
        this.uow.track(order);
        return { payment: { ...record, reviewedById: null, reviewedAt: null, createdAt: now }, refundable: result.refundable, repeated: false };
      });
      if (out.repeated && receipt) await this.files.remove(receipt.storageKey).catch(() => {});
      return out;
    } catch (err) {
      if (receipt) await this.files.remove(receipt.storageKey).catch(() => {});
      throw err;
    }
  }

  /**
   * Руководитель отменяет ошибочный ручной платёж (или возврат; also — несколько записей заказа сразу): запись остаётся в журнале оплат с пометкой, кто, когда и
   * почему, но в «получено», финансы, выручку и комиссии больше не входит; заказ пересчитывает деньги (Order.voidMoney) —
   * не хватает, снова ждёт доплату. Онлайн-оплату так не отменить: её подтвердила платёжная система (деньги пришли —
   * только возврат). Под блокировкой заказа, чтобы одновременная оплата не потерялась.
   */
  async voidPayment(input: VoidPaymentInput): Promise<{ payment: OrderPaymentRecord; received: number; outstanding: number; reopened: boolean }> {
    const reason = input.reason.trim().slice(0, 500);
    if (reason.length < 3) throw new OrderingError("paymentRule", "Укажите причину отмены платежа");
    const ids = [input.paymentId, ...(input.also ?? [])];
    if (new Set(ids).size !== ids.length) throw new OrderingError("paymentRule", "Платёж указан дважды");
    const check = (p: OrderPaymentRecord | null, orderId: string) => {
      if (!p || p.orderId !== orderId) throw new OrderingError("paymentRule", "Платёж не найден");
      if (p.method !== "manual") throw new OrderingError("paymentRule", "Онлайн-оплату подтвердила платёжная система — её не отменить, только вернуть клиенту");
      if (p.voidedAt) throw new OrderingError("paymentRule", "Платёж уже отменён");
      return p;
    };
    const found = await this.payments.find(input.paymentId);
    if (!found) throw new OrderingError("paymentRule", "Платёж не найден");
    check(found, found.orderId);
    const now = this.clock.now();
    return this.uow.run(async () => {
      const order = await this.orders.lockById(found.orderId);
      if (!order) throw new OrderingError("orderNotFound");
      // Повторно — под блокировкой: два руководителя одновременно не отменят платёж дважды. Все записи — этого заказа.
      const rows: OrderPaymentRecord[] = [];
      for (const id of ids) rows.push(check(await this.payments.find(id), order.id));
      const day = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: storeTimeZone() });
      const entries = rows.map((p) => ({ kind: p.kind, amount: p.amount, label: `${ORDER_MONEY_LABELS.manual} от ${day.format(p.paidAt)}${p.receipt ? `, чек ${p.receipt.fileName}` : ""}${p.reviewedAt ? ", был отмечен проверенным" : ""}` }));
      const result = order.voidMoney({ ...entries[0], reason, actor: input.actor.label, now, also: entries.slice(1) });
      for (const p of rows) await this.payments.void(p.id, input.actor.userId, now, reason);
      await this.orders.save(order);
      this.uow.track(order);
      return { payment: { ...rows[0], voidedAt: now, voidedById: input.actor.userId, voidReason: reason }, ...result };
    });
  }

  /** Онлайн-оплата (вебхук или сверка): "recorded" — деньги записаны, "duplicate" — эта операция уже была. */
  async recordOnline(input: OnlinePaymentInput, actor: Actor): Promise<{ status: "recorded" | "duplicate" | "notFound"; settled: boolean; overpaid: number }> {
    return this.uow.run(async () => {
      const order = await this.orders.lockById(input.orderId);
      if (!order) return { status: "notFound" as const, settled: false, overpaid: 0 };
      const id = this.payments.nextId();
      const added = await this.payments.add({ id, orderId: order.id, kind: "payment", amount: input.amount, method: input.method, externalRef: input.externalRef, paidAt: input.paidAt, note: "", receipt: null, createdById: null });
      if (!added) return { status: "duplicate" as const, settled: false, overpaid: 0 };
      const result = order.receiveMoney({ paymentId: input.paymentId ?? input.externalRef, amount: input.amount, method: input.method, paidAt: input.paidAt, label: `${ORDER_MONEY_LABELS[input.method]}, операция ${input.externalRef}`, actor: actor.label });
      await this.orders.save(order);
      this.uow.track(order);
      return { status: "recorded" as const, ...result };
    });
  }

  /** Оплата заказа по id — веб-слою для проверок до сверки: чей заказ и кто её записал. */
  find(paymentId: string) {
    return this.payments.find(paymentId);
  }

  /** Руководитель сверил ручную оплату с выпиской. */
  async review(paymentId: string, reviewerId: string) {
    const p = await this.payments.find(paymentId);
    if (!p || p.method !== "manual" || p.reviewedAt || p.voidedAt) return null;
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
