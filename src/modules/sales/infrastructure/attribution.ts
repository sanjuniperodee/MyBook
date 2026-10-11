import "server-only";
import { sql } from "drizzle-orm";
import { executor } from "@/shared/infrastructure/database";

/**
 * Канал клиента сменили вручную — переносим его на сделки клиента, у которых своей метки нет или она тоже выбрана вручную.
 * Сделки с настоящими UTM-метками и ссылками (пришли по рекламе, по коду ссылки) не трогаем: их источник точнее.
 */
export async function setClientDealsAttribution(clientId: string, utm: Record<string, string> | null) {
  await executor().execute(sql`
    update crm_deals set utm = ${utm ? JSON.stringify(utm) : null}::jsonb
    where client_id = ${clientId} and (utm is null or utm->>'medium' = 'manual')`);
}
