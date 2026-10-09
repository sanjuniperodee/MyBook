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

/** Награда за друга: одна на оплаченный заказ. */
export interface RewardRecord {
  orderId: string;
  orderNumber: number;
  referrerId: string;
  friendId: string;
  code: string | null;
  createdAt: Date;
}

export interface RewardLedger {
  /** Занять награду за заказ; false — уже выдана (повтор события). */
  claim(record: Omit<RewardRecord, "code">): Promise<boolean>;
  setCode(orderId: string, code: string): Promise<void>;
  forReferrer(userId: string): Promise<RewardRecord[]>;
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
