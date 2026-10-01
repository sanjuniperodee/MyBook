import type { Actor, Clock, UnitOfWork } from "@/shared/application";
import { getPlan, type PlanId } from "@/config/site";
import type { Locale } from "@/i18n/config";
import { GIFT_VALID_DAYS, GiftCard, OrderingError, PromoCode, type GiftCardRepository, type PromoCodeRepository } from "../domain";
import type { CodeGenerator, PaymentSettings } from "./ports";

export interface PurchaseGiftCommand {
  plan: PlanId;
  buyerUserId: string | null;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  recipientName: string;
  recipientEmail: string | null;
  sendAt: string | null;
  message: string;
  locale: Locale;
  buyerLocale: Locale;
}

/** Подарочные сертификаты: покупка, подтверждение оплаты (выпуск кода), доставка получателю. */
export class GiftsService {
  constructor(
    private readonly gifts: GiftCardRepository,
    private readonly promos: PromoCodeRepository,
    private readonly codes: CodeGenerator,
    private readonly payments: PaymentSettings,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly today: () => string,
  ) {}

  async purchase(cmd: PurchaseGiftCommand): Promise<GiftCard> {
    const plan = getPlan(cmd.plan);
    if (!plan) throw new OrderingError("giftNotFound", "unknown plan");
    const identity = await this.gifts.nextIdentity();
    const gift = GiftCard.purchase(
      identity.id,
      { ...cmd, number: identity.number, token: this.codes.giftToken(), plan: plan.id, amount: plan.price, currency: this.payments.currency(), paymentProvider: this.payments.provider(), today: this.today() },
      this.clock.now(),
    );
    await this.uow.run(async () => {
      await this.gifts.add(gift);
      this.uow.track(gift);
    });
    return gift;
  }

  /**
   * Оплата подтверждена: в одной транзакции выпускаем одноразовый промокод на номинал и привязываем
   * его к сертификату. Строка блокируется — двойное подтверждение (вебхук + сотрудник) безопасно.
   */
  async confirmPayment(giftId: string, paymentId: string | null, actor: Actor): Promise<GiftCard | null> {
    return this.uow.run(async () => {
      const gift = await this.gifts.lockById(giftId);
      if (!gift) throw new OrderingError("giftNotFound");
      if (gift.status !== "pending_payment") return null;
      const now = this.clock.now();
      let promo: PromoCode | null = null;
      for (let i = 0; i < 5 && !promo; i++) {
        const candidate = PromoCode.create(this.promos.nextId(), { code: this.codes.giftCode(), kind: "fixed", value: gift.amount, maxUses: 1, expiresAt: new Date(now.getTime() + GIFT_VALID_DAYS * 86_400_000), note: `Подарочный сертификат №${gift.number} (${actor.label})` }, now);
        if (await this.promos.add(candidate)) promo = candidate;
      }
      if (!promo) throw new Error("could not issue a gift code");
      gift.markPaid(promo.id, paymentId, actor.label, now);
      await this.gifts.save(gift);
      this.uow.track(gift);
      return gift;
    });
  }

  async claimPayment(token: string): Promise<GiftCard | null> {
    return this.uow.run(async () => {
      const gift = await this.gifts.findByToken(token);
      if (!gift || !gift.claimPayment(this.clock.now())) return gift;
      await this.gifts.save(gift);
      this.uow.track(gift);
      return gift;
    });
  }

  /** Отмена: выпущенный код больше не принимается. */
  async cancel(giftId: string): Promise<void> {
    await this.uow.run(async () => {
      const gift = await this.gifts.findById(giftId);
      if (!gift) return;
      gift.cancel();
      await this.gifts.save(gift);
      if (gift.promoCodeId) {
        const promo = await this.promos.findById(gift.promoCodeId);
        if (promo) {
          promo.deactivate();
          await this.promos.save(promo);
        }
      }
    });
  }

  async markSent(giftId: string) {
    const gift = await this.gifts.findById(giftId);
    if (!gift) return;
    gift.markSent(this.clock.now());
    await this.gifts.save(gift);
  }

  async findByNumber(number: number) {
    return this.gifts.findByNumber(number);
  }

  async dueForDelivery(limit = 50) {
    return this.gifts.findDueForDelivery(this.today(), limit);
  }
}
