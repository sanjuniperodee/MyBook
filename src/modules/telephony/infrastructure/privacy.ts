import "server-only";
import { eq } from "drizzle-orm";
import { crmCalls } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { deletePrefix } from "@/shared/infrastructure/storage";

/**
 * Звонки клиента (удаление аккаунта): в журнале остаются время, длительность и сотрудник, без номера; записи
 * разговоров WhatsApp на нашем диске удаляются, ссылки на записи АТС забываются (у АТС они живут по её сроку хранения).
 */
export const telephonyPrivacy = {
  async forgetClient(clientId: string) {
    const rows = await executor()
      .update(crmCalls)
      .set({ clientPhone: "", hasRecording: false, recordingRef: null })
      .where(eq(crmCalls.clientId, clientId))
      .returning({ id: crmCalls.id });
    for (const r of rows) await deletePrefix(`call-recordings/${r.id}`);
  },
};
