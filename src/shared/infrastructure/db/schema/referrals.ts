/** Награды за приглашения (модуль referrals). */
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./identity";
import { orders } from "./ordering";
import { crmDeals } from "./sales";

/**
 * Награды за приглашения: друг оплатил покупку по коду — владельцу кода промокод. Одна на заказ сайта и одна на сделку:
 * покупка из чата (счёт по договорённости, contacts-d7) — по сделке, сколько бы счетов по ней ни оплатили.
 */
export const referralRewards = pgTable(
  "referral_rewards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id").references(() => crmDeals.id, { onDelete: "cascade" }),
    /** Номер заказа или (для покупки из чата) сделки. */
    orderNumber: integer("order_number").notNull(),
    referrerId: uuid("referrer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Друг; у покупки из чата аккаунта может ещё не быть. */
    friendId: uuid("friend_id").references(() => users.id, { onDelete: "set null" }),
    /** Выданный промокод-награда (null — выдать не удалось, см. журнал ошибок). */
    code: text("code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("referral_rewards_referrer_idx").on(t.referrerId),
    index("referral_rewards_friend_idx").on(t.friendId),
    uniqueIndex("referral_rewards_order_idx").on(t.orderId),
    uniqueIndex("referral_rewards_deal_idx").on(t.dealId),
    check("referral_rewards_purchase", sql`${t.orderId} is not null or ${t.dealId} is not null`),
  ],
);
