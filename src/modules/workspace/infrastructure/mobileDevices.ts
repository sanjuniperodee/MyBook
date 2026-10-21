import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/shared/infrastructure/db";
import { crmMobileDevices } from "@/shared/infrastructure/db/schema";
import { apnsConfig } from "./apns";

/** Телефоны сотрудников с мобильным приложением: токен устройства для push. */
export const mobileDevices = {
  /** Повторная регистрация того же токена передаёт его новому владельцу (сменили аккаунт на телефоне) и обновляет окружение. */
  async register(userId: string, d: { token: string; platform: "ios"; environment: "production" | "sandbox" }) {
    const token = d.token.toLowerCase();
    await db
      .insert(crmMobileDevices)
      .values({ userId, token, platform: d.platform, environment: d.environment })
      .onConflictDoUpdate({ target: crmMobileDevices.token, set: { userId, platform: d.platform, environment: d.environment, lastSeenAt: new Date() } });
  },

  /** Забыть телефон (выход из аккаунта): чужой токен не трогаем. */
  async forget(userId: string, token: string) {
    await db.delete(crmMobileDevices).where(and(eq(crmMobileDevices.token, token.toLowerCase()), eq(crmMobileDevices.userId, userId)));
  },

  /** Ключ APNs на сервере задан — push на iPhone отправляются. */
  pushReady: () => !!apnsConfig(),
};
