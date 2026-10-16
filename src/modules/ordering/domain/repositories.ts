import type { DealInvoice } from "./DealInvoice";
import type { GiftCard } from "./GiftCard";
import type { Order } from "./Order";
import type { PaymentInvoice, PaymentTarget } from "./PaymentInvoice";
import type { PromoCode } from "./PromoCode";

/** Порты хранения. Реализации — в infrastructure; домен о SQL не знает. */
export interface OrderRepository {
  /** Идентичность нового заказа: uuid и номер из последовательности. */
  nextIdentity(): Promise<{ id: string; number: number }>;
  findById(id: string): Promise<Order | null>;
  /** Блокирует заказ до конца транзакции: две оплаты (вебхук и сотрудник) не посчитают «получено» неверно. */
  lockById(id: string): Promise<Order | null>;
  findByNumber(number: number): Promise<Order | null>;
  /** Заказ клиента (чужой — как будто не существует). */
  findOwned(id: string, userId: string): Promise<Order | null>;
  hasOtherActiveOrders(bookId: string, exceptOrderId: string): Promise<boolean>;
  /** Клиент уже покупал (оплаченный и не отменённый заказ) — для кодов «только на первую книгу». */
  hasPaidOrders(userId: string): Promise<boolean>;
  add(order: Order): Promise<void>;
  save(order: Order): Promise<void>;
}

export interface PromoCodeRepository {
  nextId(): string;
  findByCode(code: string): Promise<PromoCode | null>;
  /** Несколько кодов одним запросом; ненайденных в ответе нет. */
  findByCodes(codes: string[]): Promise<PromoCode[]>;
  findById(id: string): Promise<PromoCode | null>;
  /** Код-приглашение, который клиент раздаёт друзьям. */
  findByOwner(ownerId: string): Promise<PromoCode | null>;
  /** Атомарно занять одно использование (условие проверяется в БД — гонки двух заказов исключены). */
  tryReserve(id: string, now: Date): Promise<boolean>;
  release(code: string): Promise<void>;
  /** Сохранить новый код; false — такой код уже есть. */
  add(promo: PromoCode): Promise<boolean>;
  save(promo: PromoCode): Promise<void>;
}

export interface GiftCardRepository {
  nextIdentity(): Promise<{ id: string; number: number }>;
  findById(id: string): Promise<GiftCard | null>;
  findByNumber(number: number): Promise<GiftCard | null>;
  findByToken(token: string): Promise<GiftCard | null>;
  findByPromoId(promoId: string): Promise<GiftCard | null>;
  /** Оплаченные сертификаты, которые пора отправить получателю. */
  findDueForDelivery(today: string, limit: number): Promise<GiftCard[]>;
  /** Блокирует строку до конца транзакции (подтверждение оплаты из двух мест сразу). */
  lockById(id: string): Promise<GiftCard | null>;
  add(gift: GiftCard): Promise<void>;
  save(gift: GiftCard): Promise<void>;
}

export interface PaymentInvoiceRepository {
  nextId(): string;
  findById(id: string): Promise<PaymentInvoice | null>;
  /** Блокирует строку до конца транзакции: вебхук и сверка могут прийти одновременно. */
  lockById(id: string): Promise<PaymentInvoice | null>;
  findByExternalId(provider: "kaspi", externalId: string): Promise<PaymentInvoice | null>;
  /** Последний счёт по заказу или сертификату (любой статус). */
  latestFor(target: PaymentTarget): Promise<PaymentInvoice | null>;
  /** Счета, которые стоит сверить с Kaspi: ждущие и закрытые нами по сроку, созданные не раньше since. */
  toReconcile(since: Date, limit: number): Promise<PaymentInvoice[]>;
  add(invoice: PaymentInvoice): Promise<void>;
  save(invoice: PaymentInvoice): Promise<void>;
}

/** Запись журнала денег по заказу. */
export interface OrderPaymentRecord {
  id: string;
  orderId: string;
  amount: number;
  method: "manual" | "kaspi" | "cloudpayments";
  externalRef: string | null;
  paidAt: Date;
  note: string;
  receipt: { storageKey: string; fileName: string; mime: string; size: number } | null;
  createdById: string | null;
  reviewedById: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

export interface OrderPaymentRepository {
  nextId(): string;
  /** false — эта операция платёжной системы уже записана (повтор вебхука): денег второй раз нет. */
  add(p: Omit<OrderPaymentRecord, "reviewedById" | "reviewedAt" | "createdAt">): Promise<boolean>;
  list(orderId: string): Promise<OrderPaymentRecord[]>;
  find(id: string): Promise<OrderPaymentRecord | null>;
  /** Руководитель сверил ручную оплату с поступлением на счёт. */
  review(id: string, reviewerId: string, at: Date): Promise<void>;
}

export interface DealInvoiceRepository {
  nextIdentity(): Promise<{ id: string; number: number }>;
  findById(id: string): Promise<DealInvoice | null>;
  findByToken(token: string): Promise<DealInvoice | null>;
  findByNumber(number: number): Promise<DealInvoice | null>;
  findByIssueKey(key: string): Promise<DealInvoice | null>;
  /** Блокирует счёт до конца транзакции (вебхук, сверка и сотрудник подтверждают одновременно). */
  lockById(id: string): Promise<DealInvoice | null>;
  /** Выпуск — по одному на сделку: блокировка сделки до конца транзакции. */
  lockDeal(dealId: string): Promise<void>;
  openFor(dealId: string): Promise<DealInvoice | null>;
  listFor(dealId: string): Promise<DealInvoice[]>;
  /** Ждущие оплаты с истёкшим сроком. */
  overdue(now: Date, limit: number): Promise<DealInvoice[]>;
  /** Оплаченные, по которым доступ в кабинет ещё не выдан. */
  accessDue(limit: number): Promise<DealInvoice[]>;
  /** Доступ отправлен после since: проход проверяет доставку сообщения (ошибка — «не ушёл», доставлено — «доставлен»). */
  accessSentSince?(since: Date, limit: number): Promise<DealInvoice[]>;
  add(invoice: DealInvoice): Promise<void>;
  save(invoice: DealInvoice): Promise<void>;
}
