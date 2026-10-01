import { AggregateRoot } from "@/shared/domain";
import type { PlanId } from "@/config/site";
import type { Locale } from "@/i18n/config";
import { OrderingError } from "./errors";
import { OrderingEvents } from "./events";

export type GiftStatus = "pending_payment" | "paid" | "cancelled";

export interface GiftCardProps {
  number: number;
  token: string;
  plan: PlanId;
  amount: number;
  currency: string;
  status: GiftStatus;
  paymentProvider: string;
  paymentId: string | null;
  paymentClaimedAt: Date | null;
  paidAt: Date | null;
  buyerUserId: string | null;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  recipientName: string;
  recipientEmail: string | null;
  message: string;
  locale: Locale;
  buyerLocale: Locale;
  /** YYYY-MM-DD; null — сразу после оплаты. */
  sendAt: string | null;
  sentAt: Date | null;
  promoCodeId: string | null;
  createdAt: Date;
}

/** Срок действия выпущенного кода. */
export const GIFT_VALID_DAYS = 365;

/** Подарочный сертификат: после оплаты под него выпускается одноразовый промокод на номинал. */
export class GiftCard extends AggregateRoot<GiftCardProps> {
  static restore(id: string, props: GiftCardProps) {
    return new GiftCard(id, props);
  }

  static purchase(
    id: string,
    input: Omit<GiftCardProps, "status" | "paymentId" | "paymentClaimedAt" | "paidAt" | "sentAt" | "promoCodeId" | "createdAt" | "sendAt"> & { sendAt: string | null; today: string },
    now: Date,
  ) {
    if (input.sendAt && input.sendAt < input.today) throw new OrderingError("giftPastDate");
    const { today: _today, ...props } = input;
    void _today;
    const gift = new GiftCard(id, { ...props, sendAt: props.recipientEmail ? props.sendAt : null, status: "pending_payment", paymentId: null, paymentClaimedAt: null, paidAt: null, sentAt: null, promoCodeId: null, createdAt: now });
    gift.record(OrderingEvents.giftPurchased({ giftId: id }));
    return gift;
  }

  get number() {
    return this.props.number;
  }
  get token() {
    return this.props.token;
  }
  get status() {
    return this.props.status;
  }
  get amount() {
    return this.props.amount;
  }
  get currency() {
    return this.props.currency;
  }
  get promoCodeId() {
    return this.props.promoCodeId;
  }
  get recipientEmail() {
    return this.props.recipientEmail;
  }

  matchesPayment(amount: number, currency?: string | null) {
    return Math.round(amount) === this.props.amount && (!currency || currency === this.props.currency);
  }

  /** Отправить получателю сейчас (а не в выбранный день)? */
  shouldSendNow(today: string) {
    return !!this.props.recipientEmail && (!this.props.sendAt || this.props.sendAt <= today);
  }

  /** Оплата подтверждена: привязываем выпущенный промокод. Повторное подтверждение — false. */
  markPaid(promoCodeId: string, paymentId: string | null, actor: string, now: Date): boolean {
    if (this.props.status !== "pending_payment") return false;
    this.props.status = "paid";
    this.props.paidAt = now;
    this.props.promoCodeId = promoCodeId;
    if (paymentId) this.props.paymentId = paymentId;
    this.record(OrderingEvents.giftPaid({ giftId: this.id, actor }));
    return true;
  }

  claimPayment(now: Date): boolean {
    if (this.props.status !== "pending_payment" || this.props.paymentClaimedAt) return false;
    this.props.paymentClaimedAt = now;
    this.record(OrderingEvents.giftPaymentClaimed({ giftId: this.id }));
    return true;
  }

  markSent(now: Date) {
    this.props.sentAt = now;
  }

  cancel() {
    this.props.status = "cancelled";
  }
}
