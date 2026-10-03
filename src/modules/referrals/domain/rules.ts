import { latinName } from "./translit";

/** Правила приглашений: «другу — скидка на первую книгу, вам — промокод за каждого друга». */
export const REFERRAL = {
  /** Скидка другу на первую книгу по ссылке-приглашению. */
  friendPercent: 10,
  /** Награда приглашающему за каждый оплаченный заказ друга. */
  rewardPercent: 10,
  rewardValidDays: 180,
} as const;

/**
 * Код-приглашение с именем владельца — его легко продиктовать и видно, от кого подарок:
 * «Асель» → ASEL-7K2Q. Без имени — FRIEND-7K2Q.
 */
export function inviteCode(name: string, suffix: string): string {
  const base = latinName(name);
  return `${base.length >= 2 ? base : "FRIEND"}-${suffix}`;
}
