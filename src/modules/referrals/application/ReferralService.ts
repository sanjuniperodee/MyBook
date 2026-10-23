import type { Clock, Logger } from "@/shared/application";
import { inviteCode, latinName, REFERRAL } from "../domain";
import type { FriendPurchases, ReferralMail, ReferralPeople, ReferralPromos, RewardLedger, RewardRecord, SuffixGenerator } from "./ports";

/** Оплаченный заказ глазами приглашений. */
export interface PaidOrder {
  orderId: string;
  number: number;
  userId: string;
  promoCode: string | null;
  /** Сделка заказа: награда за сделку одна — за заказ и счёт из чата по ней не дважды. */
  dealId?: string | null;
}

/**
 * Приглашения: у клиента — свой код для друзей (скидка на их первую книгу), за каждый оплаченный
 * заказ друга — промокод-награда и письмо. Правила «не свой код» и «только первая книга»
 * проверяет сам промокод при оформлении заказа.
 */
export class ReferralService {
  constructor(
    private readonly promos: ReferralPromos,
    private readonly ledger: RewardLedger,
    private readonly people: ReferralPeople,
    private readonly mail: ReferralMail,
    private readonly suffix: SuffixGenerator,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly purchases: FriendPurchases | null = null,
  ) {}

  /** Код-приглашение клиента: прежний или новый (с его именем латиницей). */
  async invite(userId: string): Promise<string> {
    const existing = await this.promos.ownedBy(userId);
    if (existing) return existing.code;
    const person = await this.people.get(userId);
    const name = person?.name ?? "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = await this.promos.createInvite({ ownerId: userId, code: inviteCode(name, this.suffix()), percent: REFERRAL.friendPercent, note: `Приглашения от ${name || "клиента"} (${person?.email ?? userId})` });
      if (code) return code;
    }
    throw new Error("invite code collision");
  }

  /** Приветствие по ссылке-приглашению: от кого подарок и какой. null — код не приглашение или не действует. */
  async welcome(code: string): Promise<{ code: string; percent: number; from: string } | null> {
    const promo = await this.promos.lookup(code);
    if (!promo?.ownerId || !promo.usable) return null;
    const owner = await this.people.get(promo.ownerId);
    return { code: promo.code, percent: promo.percent, from: owner?.name.trim().split(/\s+/)[0] ?? "" };
  }

  /**
   * Друг оплатил заказ по приглашению — награда владельцу кода. Повтор события безопасен: награда
   * за заказ одна. Сбой письма не отменяет награду — она видна на странице приглашений.
   */
  async onOrderPaid(order: PaidOrder) {
    if (!order.promoCode) return;
    const promo = await this.promos.lookup(order.promoCode);
    const referrerId = promo?.ownerId;
    if (!referrerId || referrerId === order.userId) return;
    await this.reward(
      { orderId: order.orderId, dealId: order.dealId ?? null, orderNumber: order.number, referrerId, friendId: order.userId, createdAt: this.clock.now() },
      { note: `Награда за друга: заказ №${order.number}` },
    );
  }

  /**
   * Друг купил из чата — оплатил счёт по сделке (contacts-d7). «От друга» — по коду-приглашению в метках сделки или
   * первого визита клиента (ссылка /r/<код>, код в сообщении из виджета сайта). Как и на сайте, — только первая покупка
   * друга и действующий код; награда за сделку одна, сколько бы счетов по ней ни оплатили.
   */
  async onDealPaid(dealId: string) {
    const deal = await this.purchases?.deal(dealId);
    if (!deal?.inviteCode || deal.repeat) return;
    const promo = await this.promos.lookup(deal.inviteCode);
    const referrerId = promo?.usable ? promo.ownerId : null;
    if (!referrerId || referrerId === deal.clientId) return;
    await this.reward(
      { orderId: null, dealId, orderNumber: deal.number, referrerId, friendId: deal.clientId, createdAt: this.clock.now() },
      { note: `Награда за друга: покупка из чата, сделка №${deal.number}`, friendName: deal.name },
    );
  }

  private async reward(record: Omit<RewardRecord, "code">, { note, friendName = "" }: { note: string; friendName?: string }) {
    const rewardId = await this.ledger.claim(record);
    if (!rewardId) return;
    const { referrerId, friendId } = record;
    const [referrer, friend] = await Promise.all([this.people.get(referrerId), friendId ? this.people.get(friendId) : null]);
    let code: string | null = null;
    for (let attempt = 0; attempt < 3 && !code; attempt++) {
      const base = latinName(referrer?.name ?? "") || "THANKS";
      code = await this.promos.issueReward({
        code: `${base}-${this.suffix()}${this.suffix()}`.slice(0, 40),
        percent: REFERRAL.rewardPercent,
        validHours: REFERRAL.rewardValidDays * 24,
        note,
      });
    }
    if (!code) {
      this.logger.error("referral reward: no free code", undefined, { orderId: record.orderId, dealId: record.dealId });
      return;
    }
    await this.ledger.setCode(rewardId, code);
    if (referrer && !referrer.optOut)
      await this.mail
        .rewarded(referrer, { code, percent: REFERRAL.rewardPercent, validDays: REFERRAL.rewardValidDays, friendName: (friend?.name || friendName).trim().split(/\s+/)[0] ?? "" })
        .catch((err) => this.logger.error("referral reward mail", err));
  }

  /** Страница приглашений: код, сколько друзей заказали, награды и их состояние. */
  async summary(userId: string) {
    const [promo, rewards] = await Promise.all([this.promos.ownedBy(userId), this.ledger.forReferrer(userId)]);
    const codes = rewards.flatMap((r) => (r.code ? [r.code] : []));
    const status = codes.length ? await this.promos.status(codes) : new Map<string, { used: boolean; expiresAt: Date | null }>();
    return {
      code: promo?.code ?? null,
      friends: rewards.length,
      rewards: rewards.flatMap((r) => (r.code ? [{ code: r.code, orderNumber: r.orderNumber, chat: !r.orderId, createdAt: r.createdAt, ...(status.get(r.code) ?? { used: false, expiresAt: null }) }] : [])),
    };
  }
}
