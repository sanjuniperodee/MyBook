import type { Clock } from "@/shared/application";
import { formatPrice } from "@/config/site";
import { OrderingError, PromoCode, normalizePromoCode, type OrderRepository, type PromoCodeRepository, type PromoKind, type PromoRejection } from "../domain";

export interface PromoView {
  id: string;
  code: string;
  kind: PromoKind;
  value: number;
  label: string;
  /** Код-приглашение: чей он (для приветствия «… дарит вам скидку»). */
  ownerId: string | null;
}

export type PromoCheck = { ok: true; promo: PromoView } | { ok: false; error: PromoRejection };

/** Промокоды: проверка для клиента (предпросмотр скидки, погашение сертификата) и управление в CRM. */
export class PromoService {
  constructor(
    private readonly promos: PromoCodeRepository,
    private readonly orders: Pick<OrderRepository, "hasPaidOrders">,
    private readonly clock: Clock,
  ) {}

  /** buyerId — кто применяет код при оформлении: тогда действуют и правила покупателя (не свой код, первая книга). */
  async check(rawCode: string, buyerId?: string): Promise<PromoCheck> {
    const code = normalizePromoCode(rawCode);
    if (!code) return { ok: false, error: "empty" };
    const promo = await this.promos.findByCode(code);
    if (!promo) return { ok: false, error: "notFound" };
    const buyer = buyerId ? { userId: buyerId, hasPaidOrders: promo.firstOrderOnly && (await this.orders.hasPaidOrders(buyerId)) } : undefined;
    const rejection = promo.rejection(this.clock.now(), buyer);
    if (rejection) return { ok: false, error: rejection };
    return { ok: true, promo: { id: promo.id, code: promo.code, kind: promo.kind, value: promo.value, label: promo.describe(formatPrice), ownerId: promo.ownerId } };
  }

  /** Новый код из CRM. expiresAt — дата (YYYY-MM-DD), код действует до конца этого дня. */
  async create(input: { code: string; kind: PromoKind; value: number; maxUses?: number | null; expiresOn?: Date | null; note?: string }): Promise<PromoCode> {
    const expiresAt = input.expiresOn ? new Date(input.expiresOn.getTime() + 24 * 3600 * 1000 - 1) : null;
    const promo = PromoCode.create(this.promos.nextId(), { ...input, expiresAt }, this.clock.now());
    if (!(await this.promos.add(promo))) throw new OrderingError("promoExists");
    return promo;
  }

  async toggle(id: string): Promise<PromoCode> {
    const promo = await this.promos.findById(id);
    if (!promo) throw new OrderingError("notFound");
    promo.toggle();
    await this.promos.save(promo);
    return promo;
  }

  /** Код-приглашение клиента: скидка друзьям на первую книгу, без срока и ограничения числа друзей. null — код занят. */
  async issueReferral(input: { ownerId: string; code: string; percent: number; note: string }): Promise<PromoCode | null> {
    const promo = PromoCode.create(this.promos.nextId(), { code: input.code, kind: "percent", value: input.percent, note: input.note, ownerId: input.ownerId, firstOrderOnly: true }, this.clock.now());
    return (await this.promos.add(promo)) ? promo : null;
  }

  referralOf(ownerId: string) {
    return this.promos.findByOwner(ownerId);
  }

  findByCode(code: string) {
    return this.promos.findByCode(code);
  }

  /** Персональный одноразовый код (скидка менеджера из чата). */
  async issuePersonal(input: { code: string; percent: number; validHours: number; note: string }): Promise<PromoCode | null> {
    const now = this.clock.now();
    const promo = PromoCode.create(this.promos.nextId(), { code: input.code, kind: "percent", value: input.percent, maxUses: 1, expiresAt: new Date(now.getTime() + input.validHours * 3600_000), note: input.note }, now);
    return (await this.promos.add(promo)) ? promo : null;
  }
}
