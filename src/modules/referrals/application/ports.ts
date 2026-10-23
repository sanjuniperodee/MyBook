import type { Locale } from "@/i18n/config";

/** Код-приглашение глазами приглашений (контекст Ordering). */
export interface InvitePromo {
  code: string;
  ownerId: string | null;
  percent: number;
  /** Код действует сейчас (активен, не истёк). */
  usable: boolean;
}

/** Промокоды контекста Ordering через узкий порт. */
export interface ReferralPromos {
  ownedBy(userId: string): Promise<InvitePromo | null>;
  /** Новый код-приглашение; null — такой код уже есть. */
  createInvite(input: { ownerId: string; code: string; percent: number; note: string }): Promise<string | null>;
  lookup(code: string): Promise<InvitePromo | null>;
  /** Одноразовый код-награда; null — код занят. */
  issueReward(input: { code: string; percent: number; validHours: number; note: string }): Promise<string | null>;
  /** Состояние кодов-наград: использован ли, до какого числа действует. */
  status(codes: string[]): Promise<Map<string, { used: boolean; expiresAt: Date | null }>>;
}

/** Награда за друга: одна на оплаченный заказ сайта и одна на сделку (покупка из чата по счёту). */
export interface RewardRecord {
  orderId: string | null;
  dealId: string | null;
  /** Номер заказа, а у покупки из чата — номер сделки. */
  orderNumber: number;
  referrerId: string;
  /** Друг; у покупки из чата аккаунта может ещё не быть. */
  friendId: string | null;
  code: string | null;
  createdAt: Date;
}

export interface RewardLedger {
  /** Занять награду за покупку: ключ записи; null — уже выдана (повтор события, награда за эту сделку уже была). */
  claim(record: Omit<RewardRecord, "code">): Promise<string | null>;
  setCode(rewardId: string, code: string): Promise<void>;
  forReferrer(userId: string): Promise<RewardRecord[]>;
}

/** Покупка из чата глазами приглашений (контекст Sales): сделка, по которой оплачен счёт. */
export interface ChatPurchase {
  number: number;
  /** Имя клиента в сделке — для письма, если аккаунта ещё нет. */
  name: string;
  clientId: string | null;
  /** Код-приглашение, по которому пришёл клиент: метки сделки или первого визита клиента (source=invite). */
  inviteCode: string | null;
  /** У клиента уже были покупки до этой сделки — скидка друга и награда только за первую. */
  repeat: boolean;
}

export interface FriendPurchases {
  deal(dealId: string): Promise<ChatPurchase | null>;
}

export interface ReferralPerson {
  name: string;
  email: string;
  locale: Locale;
  /** Отписался от писем. */
  optOut: boolean;
}

export interface ReferralPeople {
  get(userId: string): Promise<ReferralPerson | null>;
}

export interface ReferralMail {
  rewarded(to: ReferralPerson, input: { code: string; percent: number; validDays: number; friendName: string }): Promise<void>;
}

export type SuffixGenerator = () => string;
