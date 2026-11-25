import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/shared/infrastructure/db";
import { crmMobileDevices } from "@/shared/infrastructure/db/schema";
import { apnsConfig } from "./apns";
import { fcmConfig } from "./fcm";

/**
 * Телефоны с мобильными приложениями: токен устройства для push (iPhone — APNs, Android — FCM). app — какое
 * приложение: crm (продажник) или client (клиентское «MyBooks»); push уходит только устройствам нужного приложения.
 */
export const mobileDevices = {
  /** Повторная регистрация того же токена передаёт его новому владельцу (сменили аккаунт на телефоне) и обновляет окружение. */
  async register(userId: string, d: { token: string; platform: "ios" | "android"; environment: "production" | "sandbox"; app?: "crm" | "client" }) {
    // Токен APNs — hex (регистр не важен), токен FCM чувствителен к регистру.
    const token = d.platform === "ios" ? d.token.toLowerCase() : d.token;
    const app = d.app ?? "crm";
    await db
      .insert(crmMobileDevices)
      .values({ userId, token, platform: d.platform, environment: d.environment, app })
      .onConflictDoUpdate({ target: crmMobileDevices.token, set: { userId, platform: d.platform, environment: d.environment, app, lastSeenAt: new Date() } });
  },

  /** Забыть телефон (выход из аккаунта): чужой токен не трогаем. */
  async forget(userId: string, token: string) {
    const hex = /^[0-9a-fA-F]+$/.test(token);
    await db.delete(crmMobileDevices).where(and(eq(crmMobileDevices.token, hex ? token.toLowerCase() : token), eq(crmMobileDevices.userId, userId)));
  },

  /** Ключ на сервере задан — push на эту платформу отправляются. */
  pushReady: (platform: "ios" | "android" = "ios") => (platform === "android" ? !!fcmConfig() : !!apnsConfig()),
};
