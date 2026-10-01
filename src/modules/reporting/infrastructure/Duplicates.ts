import "server-only";
import { sql } from "drizzle-orm";
import { executor } from "@/shared/infrastructure/database";

export type DuplicateGroup = { key: string; kind: "phone" | "email"; deals: { id: string; number: number; title: string; stage: string; color: string; created: string; assignee: string | null }[] };

/** Группы сделок одного человека (по телефону, включая доп. номера, или e-mail). */
export async function duplicateGroups() {
  const { rows } = await executor().execute<DuplicateGroup>(sql`
    with keys as (
      select d.id, 'phone' as kind, right(regexp_replace(p, '\\D', '', 'g'), 10) as key
      from crm_deals d cross join lateral unnest(array_append(d.extra_phones, coalesce(d.contact_phone, ''))) p
      union
      select d.id, 'email', lower(d.contact_email) from crm_deals d where coalesce(d.contact_email, '') <> ''
    ), groups as (
      select kind, key, array_agg(distinct id) as ids from keys where length(key) >= 6 group by kind, key having count(distinct id) > 1
    )
    select g.kind, g.key, json_agg(json_build_object('id', d.id, 'number', d.number, 'title', d.title, 'stage', s.name, 'color', s.color, 'created', d.created_at, 'assignee', d.assignee_id) order by d.created_at) as deals
    from groups g join crm_deals d on d.id = any(g.ids) join crm_stages s on s.id = d.stage_id
    group by g.kind, g.key
    order by max(d.created_at) desc
    limit 100`);
  return rows;
}
