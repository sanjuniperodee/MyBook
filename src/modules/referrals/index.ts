import type { Clock, Logger, Mailer } from "@/shared/application";
import { ReferralService, type ReferralPromos } from "./application";
import { randomSuffix, referralMail } from "./infrastructure/adapters";
import { DrizzleRewardLedger, drizzleReferralPeople } from "./infrastructure/persistence";

export { REFERRAL, inviteCode, latinName } from "./domain";
export type { PaidOrder, ReferralPromos, InvitePromo } from "./application";
export { inviteUrl } from "./infrastructure/adapters";

/** Cookie с кодом-приглашением: друг пришёл по ссылке — скидка подставится при оформлении. */
export const INVITE_COOKIE = "mb_invite";

/** Публичный фасад контекста «Приглашения»: код для друзей, награда за их заказы. */
export class ReferralsModule {
  readonly service: ReferralService;

  constructor(deps: { promos: ReferralPromos; mailer: Mailer; clock: Clock; logger: Logger }) {
    this.service = new ReferralService(deps.promos, new DrizzleRewardLedger(), drizzleReferralPeople, referralMail(deps.mailer), randomSuffix, deps.clock, deps.logger);
  }
}
