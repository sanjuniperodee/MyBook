import type { Actor, Clock, UnitOfWork } from "@/shared/application";
import { getPlan, type PlanId } from "@/config/site";
import type { Locale } from "@/i18n/config";
import { receiptProblem, safeReceiptName, sniffReceipt } from "@/shared/domain/receipt";
import { GIFT_VALID_DAYS, GiftCard, OrderingError, PromoCode, type GiftCardRepository, type GiftReceipt, type PromoCodeRepository } from "../domain";
import type { CodeGenerator, PaymentSettings } from "./ports";
import type { ReceiptFiles } from "./OrderPaymentsService";

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
    private readonly files: ReceiptFiles | null = null,
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
  async confirmPayment(giftId: string, paymentId: string | null, actor: Actor, receipt: GiftReceipt | null = null): Promise<GiftCard | null> {
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
      gift.markPaid(promo.id, paymentId, actor.label, now, receipt);
      await this.gifts.save(gift);
      this.uow.track(gift);
      return gift;
    });
  }

  /**
   * Сотрудник подтвердил оплату переводом (analytics-d8): только с чеком — скриншот, фото или PDF. Чек — до кода:
   * без чека код не выпускается; не выпустился (уже оплачен, ошибка) — файл убираем. null — сертификат уже не ждёт оплаты.
   */
  async confirmManual(giftId: string, file: { bytes: Buffer; fileName: string }, actor: Actor): Promise<GiftCard | null> {
    if (!this.files) throw new Error("receipt storage is not configured");
    const problem = receiptProblem(file.bytes);
    const type = sniffReceipt(file.bytes);
    if (problem || !type) throw new OrderingError("receiptInvalid", problem ?? "type");
    const gift = await this.gifts.findById(giftId);
    if (!gift) throw new OrderingError("giftNotFound");
    if (gift.status !== "pending_payment") return null;
    const receipt = { storageKey: `gifts/${gift.id}/receipt-${this.clock.now().getTime().toString(36)}.${type.ext}`, fileName: safeReceiptName(file.fileName, type.ext), mime: type.mime, size: file.bytes.length };
    await this.files.put(receipt.storageKey, file.bytes);
    try {
      const paid = await this.confirmPayment(gift.id, null, actor, receipt);
      if (!paid) await this.files.remove(receipt.storageKey).catch(() => {});
      return paid;
    } catch (err) {
      await this.files.remove(receipt.storageKey).catch(() => {});
      throw err;
    }
  }

  /** Чек ручного подтверждения — сотруднику в CRM. */
  async receipt(giftId: string) {
    const gift = await this.gifts.findById(giftId);
    const receipt = gift?.snapshot().receipt;
    if (!receipt || !this.files) return null;
    const bytes = await this.files.read(receipt.storageKey);
    return bytes ? { gift: gift!, receipt, bytes } : null;
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
