/** Журнал автоматических писем (модуль notifications). */
import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";

/** Журнал автоматических писем: каждое письмо конкретного вида уходит клиенту один раз. */
export const emailLog = pgTable(
  "email_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Вид письма с уточнением, например «nudge:<bookId>». */
    key: text("key").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("email_log_user_key_idx").on(t.userId, t.key)],
);
