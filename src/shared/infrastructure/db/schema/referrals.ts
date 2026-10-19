/** Награды за приглашения (модуль referrals). */
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";
import { orders } from "./ordering";

/** Награды за приглашения: друг оплатил заказ по коду — владельцу кода промокод. Одна на заказ. */
export const referralRewards = pgTable(
  "referral_rewards",
  {
    orderId: uuid("order_id")
      .primaryKey()
      .references(() => orders.id, { onDelete: "cascade" }),
    orderNumber: integer("order_number").notNull(),
    referrerId: uuid("referrer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    friendId: uuid("friend_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Выданный промокод-награда (null — выдать не удалось, см. журнал ошибок). */
    code: text("code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("referral_rewards_referrer_idx").on(t.referrerId)],
);
