import { AggregateRoot } from "@/shared/domain";
import { normalizePromoCode, type Discount } from "./Pricing";
import { OrderingError } from "./errors";

export type PromoKind = "percent" | "fixed";
/** Почему код нельзя применить — ключ словаря checkout.promo. */
export type PromoRejection = "empty" | "notFound" | "expired" | "used" | "ownCode" | "firstOrderOnly";

/** Кто применяет код — для правил «не свой код» и «только на первую книгу». */
export interface PromoBuyer {
  userId: string;
  hasPaidOrders: boolean;
}

export interface PromoCodeProps {
  code: string;
  kind: PromoKind;
  value: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: Date | null;
  active: boolean;
  note: string;
  /** Клиент, который раздаёт код друзьям (приглашения); сам он его применить не может. */
  ownerId: string | null;
  /** Только для тех, кто ещё ничего не покупал. */
  firstOrderOnly: boolean;
  createdAt: Date;
}

/** Промокод (в том числе выпущенный под подарочный сертификат). */
export class PromoCode extends AggregateRoot<PromoCodeProps> {
  static readonly CODE_PATTERN = /^[A-Z0-9_-]{3,40}$/;

  static restore(id: string, props: PromoCodeProps) {
    return new PromoCode(id, props);
  }

  /** Новый код. Проверяет формат и размер скидки — нарушения не должны дойти до БД. */
  static create(
    id: string,
    input: { code: string; kind: PromoKind; value: number; maxUses?: number | null; expiresAt?: Date | null; note?: string; ownerId?: string | null; firstOrderOnly?: boolean },
    now: Date,
  ) {
    const code = normalizePromoCode(input.code);
    if (!PromoCode.CODE_PATTERN.test(code)) throw new OrderingError("empty", "promo code format");
    if (!Number.isInteger(input.value) || input.value <= 0 || (input.kind === "percent" && input.value > 100)) throw new OrderingError("empty", "promo value");
    return new PromoCode(id, {
      code,
      kind: input.kind,
      value: input.value,
      maxUses: input.maxUses ?? null,
      usedCount: 0,
      expiresAt: input.expiresAt ?? null,
      active: true,
      note: input.note ?? "",
      ownerId: input.ownerId ?? null,
      firstOrderOnly: input.firstOrderOnly ?? false,
      createdAt: now,
    });
  }

  get code() {
    return this.props.code;
  }
  get kind() {
    return this.props.kind;
  }
  get value() {
    return this.props.value;
  }
  get active() {
    return this.props.active;
  }
  get expiresAt() {
    return this.props.expiresAt;
  }
  get ownerId() {
    return this.props.ownerId;
  }
  get firstOrderOnly() {
    return this.props.firstOrderOnly;
  }

  get discount(): Discount {
    return { kind: this.props.kind, value: this.props.value };
  }

  /** null — код можно применить сейчас. Без покупателя (страница активации) правила покупателя не проверяются. */
  rejection(now: Date, buyer?: PromoBuyer): PromoRejection | null {
    if (!this.props.active) return "notFound";
    if (this.props.expiresAt && this.props.expiresAt < now) return "expired";
    if (this.props.maxUses !== null && this.props.usedCount >= this.props.maxUses) return "used";
    if (buyer && this.props.ownerId === buyer.userId) return "ownCode";
    if (buyer && this.props.firstOrderOnly && buyer.hasPaidOrders) return "firstOrderOnly";
    return null;
  }

  assertUsable(now: Date, buyer?: PromoBuyer) {
    const r = this.rejection(now, buyer);
    if (r) throw new OrderingError(r);
  }

  /** «−10%» / «−5 000 ₸». */
  describe(formatMoney: (n: number) => string) {
    return describePromo(this.props, formatMoney);
  }

  deactivate() {
    this.props.active = false;
  }

  toggle() {
    this.props.active = !this.props.active;
  }
}

export function describePromo(p: { kind: PromoKind; value: number }, formatMoney: (n: number) => string) {
  return p.kind === "percent" ? `−${p.value}%` : `−${formatMoney(p.value)}`;
}
