import "server-only";
import { eq, inArray, or } from "drizzle-orm";
import { crmNotes, crmTasks, users } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";

/**
 * Персональные данные клиента в CRM-карточке (удаление аккаунта): заметки и задачи по клиенту и его сделкам —
 * свободный текст сотрудников — удаляются; доп. телефоны, теги, свои поля и метки первого касания стираются.
 */
export const clientsPrivacy = {
  /** Дополнительные телефоны клиента (второй номер, WhatsApp на другой SIM). */
  async phonesOf(clientId: string): Promise<string[]> {
    const [r] = await executor().select({ extra: users.extraPhones }).from(users).where(eq(users.id, clientId)).limit(1);
    return r?.extra ?? [];
  },

  async forgetClient(clientId: string, dealIds: string[]) {
    const db = executor();
    const byClient = (col: typeof crmNotes.clientId | typeof crmTasks.clientId, deal: typeof crmNotes.dealId | typeof crmTasks.dealId) =>
      dealIds.length ? or(eq(col, clientId), inArray(deal, dealIds)) : eq(col, clientId);
    await db.delete(crmNotes).where(byClient(crmNotes.clientId, crmNotes.dealId));
    await db.delete(crmTasks).where(byClient(crmTasks.clientId, crmTasks.dealId));
    await db.update(users).set({ extraPhones: [], tags: [], customFields: {}, source: null, updatedAt: new Date() }).where(eq(users.id, clientId));
  },
};
