import type { OrderingModule, PromoCode } from "@/modules/ordering";
import type { InvitePromo, ReferralPromos } from "@/modules/referrals";

/*
 * Порты промокодов для корня композиции (container.ts): приглашения друзей и награды — промокоды контекста
 * заказов, но referrals видит их через свой узкий порт и не знает про PromoCode.
 */

/** Промокоды для приглашений: коды для друзей и награды выпускает контекст заказов. */
export function referralPromos(promos: OrderingModule["promos"], now: () => Date): ReferralPromos {
  const view = (p: PromoCode): InvitePromo => ({ code: p.code, ownerId: p.ownerId, percent: p.kind === "percent" ? p.value : 0, usable: p.rejection(now()) === null });
  return {
    ownedBy: async (userId) => {
      const p = await promos.referralOf(userId);
      return p ? view(p) : null;
    },
    createInvite: async (input) => (await promos.issueReferral(input))?.code ?? null,
    lookup: async (code) => {
      const p = await promos.findByCode(code);
      return p ? view(p) : null;
    },
    issueReward: async (input) => (await promos.issuePersonal(input))?.code ?? null,
    status: async (codes) => {
      const found = await promos.findByCodes(codes);
      return new Map(found.map((p) => [p.code, { used: p.rejection(now()) === "used", expiresAt: p.expiresAt }] as const));
    },
  };
}
