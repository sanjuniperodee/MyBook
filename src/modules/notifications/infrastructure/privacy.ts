import "server-only";
import { eq } from "drizzle-orm";
import { emailLog } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";

/** Журнал отправленных писем удалённого аккаунта: писать больше некому, история рассылок не нужна. */
export const notificationsPrivacy = {
  async forgetUser(userId: string) {
    await executor().delete(emailLog).where(eq(emailLog.userId, userId));
  },
};
