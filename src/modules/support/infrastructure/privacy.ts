import "server-only";
import { sql } from "drizzle-orm";
import { supportTickets } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { normalizePhone } from "@/shared/domain/phone";

/**
 * Обращения поддержки про удалённого клиента: ссылки на аккаунт у обращения нет, поэтому телефон клиента стирается по
 * совпадению номера (по цифрам; +7, 8 и без кода — один номер). Остальной текст обращения — внутренняя работа команды.
 */
export const supportPrivacy = {
  async forgetPhones(phones: string[]) {
    const variants = new Set<string>();
    for (const p of phones) {
      const d = normalizePhone(p);
      if (d.length < 10) continue;
      variants.add(d);
      // Казахстан: +7 775…, 8 775… и 775… без кода — один номер.
      if (d.length === 11 && (d.startsWith("7") || d.startsWith("8"))) variants.add(`7${d.slice(1)}`).add(`8${d.slice(1)}`).add(d.slice(1));
    }
    if (!variants.size) return;
    await executor()
      .update(supportTickets)
      .set({ clientPhone: "" })
      .where(sql`regexp_replace(${supportTickets.clientPhone}, '\\D', '', 'g') in (${sql.join([...variants].map((v) => sql`${v}`), sql`, `)})`);
  },
};
