import { AggregateRoot } from "@/shared/domain";
import type { KaspiMethod, KaspiOutcome } from "./kaspi";

/** Что оплачивается: заказ книги или подарочный сертификат. */
export type PaymentTarget = { kind: "order"; id: string } | { kind: "gift"; id: string };

export type PaymentInvoiceStatus = "pending" | "paid" | "failed" | "cancelled" | "expired";

export interface PaymentInvoiceProps {
  provider: "kaspi";
  target: PaymentTarget;
  method: KaspiMethod;
  /** Номер операции в Kaspi (счёт или QR). */
  externalId: string;
  phone: string | null;
  amount: number;
  status: PaymentInvoiceStatus;
  /** Последний статус Kaspi как есть — для разбора в CRM. */
  providerStatus: string | null;
  checkoutUrl: string | null;
  qrToken: string | null;
  expiresAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Окно после истечения, в которое ещё ждём подтверждения: Kaspi нередко проводит платёж на секунды позже. */
const EXPIRY_GRACE_MS = 3 * 60_000;

/**
 * Счёт на оплату в Kaspi Pay — одна попытка оплатить заказ или сертификат. Попыток может быть несколько
 * (истёк, клиент отменил, выставили заново); заказ подтверждается той, что прошла.
 */
export class PaymentInvoice extends AggregateRoot<PaymentInvoiceProps> {
  static restore(id: string, props: PaymentInvoiceProps) {
    return new PaymentInvoice(id, props);
  }

  static issue(id: string, input: Omit<PaymentInvoiceProps, "status" | "paidAt" | "createdAt" | "updatedAt" | "providerStatus"> & { providerStatus?: string | null }, now: Date) {
    return new PaymentInvoice(id, { ...input, providerStatus: input.providerStatus ?? null, status: "pending", paidAt: null, createdAt: now, updatedAt: now });
  }

  get target() {
    return this.props.target;
  }
  get externalId() {
    return this.props.externalId;
  }
  get method() {
    return this.props.method;
  }
  get status() {
    return this.props.status;
  }
  get amount() {
    return this.props.amount;
  }
  get phone() {
    return this.props.phone;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }

  /** Счёт ещё можно оплатить: ждёт и не истёк (с запасом на позднее подтверждение). */
  isOpen(now: Date) {
    return this.props.status === "pending" && (!this.props.expiresAt || this.props.expiresAt.getTime() + EXPIRY_GRACE_MS > now.getTime());
  }

  /** Сумма из уведомления Kaspi сходится со счётом. Нет суммы в уведомлении — доверяем операции (она привязана к нашей сумме). */
  matchesAmount(amount: number | null) {
    return amount === null || Math.abs(amount - this.props.amount) < 0.01;
  }

  /** Подробности, которые Kaspi сообщил позже создания (ссылка, QR, срок). */
  refreshDetails(d: { checkoutUrl?: string | null; qrToken?: string | null; expiresAt?: Date | null }, now: Date) {
    if (d.checkoutUrl) this.props.checkoutUrl = d.checkoutUrl;
    if (d.qrToken) this.props.qrToken = d.qrToken;
    if (d.expiresAt) this.props.expiresAt = d.expiresAt;
    this.props.updatedAt = now;
  }

  /**
   * Новый статус от Kaspi. Оплата — окончательна; отказ, отмену и истечение ещё может перекрыть оплата
   * (подтверждение пришло после того, как мы сами закрыли счёт по сроку). true — счёт стал оплаченным.
   */
  apply(outcome: KaspiOutcome, providerStatus: string, now: Date): boolean {
    this.props.updatedAt = now;
    if (providerStatus) this.props.providerStatus = providerStatus;
    if (this.props.status === "paid" || outcome === "pending") return false;
    if (outcome === "paid") {
      this.props.status = "paid";
      this.props.paidAt = now;
      return true;
    }
    if (this.props.status === "pending") this.props.status = outcome;
    return false;
  }

  /** Мы сами закрываем счёт по сроку, если Kaspi так и не ответил. */
  expire(now: Date) {
    if (this.props.status !== "pending") return;
    this.props.status = "expired";
    this.props.updatedAt = now;
  }

  cancel(now: Date) {
    if (this.props.status !== "pending") return;
    this.props.status = "cancelled";
    this.props.updatedAt = now;
  }
}
