import "server-only";
import { eq, inArray, or, sql } from "drizzle-orm";
import { crmDeals, crmPayments, dealInvoices } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";

/**
 * Персональные данные клиента в контексте «Продажи» (удаление аккаунта): сделки остаются в воронке и отчётах, но
 * без имени, телефонов, почты, меток, своих полей и примечания; платежи и счета — суммы без имени, телефона и заметок.
 */
export const salesPrivacy = {
  async dealsOf(clientId: string): Promise<string[]> {
    const rows = await executor().select({ id: crmDeals.id }).from(crmDeals).where(eq(crmDeals.clientId, clientId));
    return rows.map((r) => r.id);
  },

  async anonymizeDeals(dealIds: string[]) {
    if (!dealIds.length) return;
    const db = executor();
    await db
      .update(crmDeals)
      .set({ title: sql`'Сделка №' || ${crmDeals.number}`, contactName: "", contactPhone: null, contactEmail: null, extraPhones: [], utm: null, customFields: {}, note: "", aiSummary: null, updatedAt: new Date() })
      .where(inArray(crmDeals.id, dealIds));
    await db.update(dealInvoices).set({ phone: null, clientName: "" }).where(inArray(dealInvoices.dealId, dealIds));
  },

  async anonymizePayments(clientId: string, dealIds: string[]) {
    const where = dealIds.length ? or(eq(crmPayments.clientId, clientId), inArray(crmPayments.dealId, dealIds)) : eq(crmPayments.clientId, clientId);
    await executor().update(crmPayments).set({ note: "" }).where(where);
  },
};
