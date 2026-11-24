import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/shared/infrastructure/db";
import { crmIosDevices, users } from "@/shared/infrastructure/db/schema";

/** iPhone сотрудников для установки приложения CRM без App Store (Ad Hoc): UDID из профиля регистрации. */
export const iosDevices = {
  /** Тот же телефон у другого сотрудника (передали телефон) — переходит к нему. */
  async save(userId: string, d: { udid: string; product: string; version: string }) {
    await db
      .insert(crmIosDevices)
      .values({ userId, udid: d.udid, product: d.product, iosVersion: d.version })
      .onConflictDoUpdate({ target: crmIosDevices.udid, set: { userId, product: d.product, iosVersion: d.version } });
  },

  ofUser: (userId: string) => db.select().from(crmIosDevices).where(eq(crmIosDevices.userId, userId)).orderBy(desc(crmIosDevices.createdAt)),

  /** Все телефоны с именем сотрудника — для регистрации в Apple. */
  all: () => db.select({ userId: crmIosDevices.userId, udid: crmIosDevices.udid, product: crmIosDevices.product, name: users.name, email: users.email }).from(crmIosDevices).innerJoin(users, eq(users.id, crmIosDevices.userId)),
};
