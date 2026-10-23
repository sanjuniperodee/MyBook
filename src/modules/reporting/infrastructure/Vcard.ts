import "server-only";
import { sql } from "drizzle-orm";
import { executor } from "@/shared/infrastructure/database";

/**
 * Клиенты для vCard (contacts-10): имя, телефон и доп. телефоны, номер последней сделки и повод (последней сделки, иначе
 * книги). since — только изменённые с этого момента (клиент, его сделки); scopeManagerId — роль «только свои».
 */
export async function vcardClients(opts: { since: Date | null; scopeManagerId: string | null; limit?: number }) {
  const since = opts.since ? sql`and (u.updated_at >= ${opts.since} or exists (select 1 from crm_deals d where d.client_id = u.id and d.updated_at >= ${opts.since}))` : sql``;
  const scope = opts.scopeManagerId ? sql`and (u.manager_id = ${opts.scopeManagerId} or u.manager_id is null)` : sql``;
  const { rows } = await executor().execute<{ id: string; name: string; phone: string | null; extra_phones: string[]; deal_number: number | null; occasion: string | null }>(sql`
    select u.id, u.name, u.phone, u.extra_phones,
      (select d.number from crm_deals d where d.client_id = u.id order by d.created_at desc limit 1) as deal_number,
      coalesce(
        (select nullif(d.custom_fields->>'occasion', '') from crm_deals d where d.client_id = u.id and coalesce(d.custom_fields->>'occasion', '') <> '' order by d.created_at desc limit 1),
        (select b.occasion from books b where b.user_id = u.id and b.occasion is not null order by b.updated_at desc limit 1)
      ) as occasion
    from users u
    where u.role = 'user' and coalesce(u.phone, '') <> '' ${since} ${scope}
    order by u.created_at desc
    limit ${opts.limit ?? 20_000}`);
  return rows;
}
