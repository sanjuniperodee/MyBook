import { timestamp } from "drizzle-orm/pg-core";

/** createdAt и updatedAt: updatedAt сам обновляется при записи через drizzle. */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
