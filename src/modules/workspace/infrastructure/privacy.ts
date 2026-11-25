import "server-only";
import { eq } from "drizzle-orm";
import { crmIosDevices, crmMobileDevices, crmPushSubscriptions } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";

/** Устройства удалённого аккаунта: push больше не уходит ни в приложение, ни в браузер. */
export const workspacePrivacy = {
  async forgetDevices(userId: string) {
    const db = executor();
    await db.delete(crmMobileDevices).where(eq(crmMobileDevices.userId, userId));
    await db.delete(crmIosDevices).where(eq(crmIosDevices.userId, userId));
    await db.delete(crmPushSubscriptions).where(eq(crmPushSubscriptions.userId, userId));
  },
};
