import "server-only";
import { sql } from "drizzle-orm";
import { executor } from "@/shared/infrastructure/database";
import { iso, localDay } from "./time";
import type { Viewer } from "./conditions";

/**
 * Сделки, которые требуют внимания (bots-11, analytics-4): бот передал диалог человеку, а клиенту не ответили дольше
 * норматива; счёт из чата истекает в ближайшие сутки или истёк за 3 дня, а нового нет; до даты события неделя, а денег
 * по сделке нет. Один запрос при открытии «Обзора», по частичным индексам ожидания, открытых счетов и даты события.
 */
export type AttentionKind = "handoff" | "invoice_expiring" | "invoice_expired" | "deadline_unpaid";

export interface AttentionRow {
  kind: AttentionKind;
  dealId: string;
  conversationId: string | null;
  number: number;
  contact: string;
  /** Когда: ожидание с, срок счёта, дата события (ГГГГ-ММ-ДД). */
  at: string;
  amount: number | null;
}

/** До даты события — столько дней, а денег нет. */
export const ATTENTION_DEADLINE_DAYS = 7;

export async function attentionDeals(viewer: Viewer, slaMinutes: number, limit = 12): Promise<AttentionRow[]> {
  const mine = viewer.seesAll ? sql`true` : sql`(d.assignee_id = ${viewer.userId} or d.assignee_id is null)`;
  const sla = Math.max(1, Math.floor(slaMinutes));
  const { rows } = await executor().execute<{ kind: AttentionKind; deal_id: string; conversation_id: string | null; number: number; contact: string; at: string; amount: number | null }>(sql`
    (select 'handoff' as kind, d.id as deal_id, c.id as conversation_id, d.number, coalesce(nullif(c.contact_name, ''), d.contact_name) as contact,
        to_char(c.awaiting_since at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at, null::int as amount
      from crm_conversations c join crm_deals d on d.id = c.deal_id
      where c.awaiting_since is not null and c.status = 'open' and c.awaiting_since <= now() - make_interval(mins => ${sla}) and ${mine}
        and exists (select 1 from crm_bot_events e where e.conversation_id = c.id and e.kind = 'handoff'
          and e.created_at > coalesce(c.last_outgoing_at, '-infinity'::timestamptz) and e.created_at <= now() - make_interval(mins => ${sla}))
      order by c.awaiting_since limit ${limit})
    union all
    (select case when i.status = 'pending_payment' then 'invoice_expiring' else 'invoice_expired' end, d.id, i.conversation_id, d.number, d.contact_name,
        to_char(i.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), i.amount
      from deal_invoices i join crm_deals d on d.id = i.deal_id join crm_stages s on s.id = d.stage_id and s.kind = 'open'
      where ${mine} and (
        (i.status = 'pending_payment' and i.expires_at <= now() + interval '1 day')
        or (i.status = 'expired' and i.expires_at > now() - interval '3 days'
          and not exists (select 1 from deal_invoices n where n.deal_id = i.deal_id and n.created_at > i.created_at)))
      order by i.expires_at limit ${limit})
    union all
    (select 'deadline_unpaid', d.id, null, d.number, d.contact_name, d.custom_fields->>'event_date', d.amount
      from crm_deals d join crm_stages s on s.id = d.stage_id and s.kind = 'open'
      where (d.custom_fields->>'event_date') >= ${iso(localDay(0))} and (d.custom_fields->>'event_date') <= ${iso(localDay(ATTENTION_DEADLINE_DAYS))} and ${mine}
        and not exists (select 1 from crm_payments p where p.deal_id = d.id and p.kind <> 'refund')
        and not exists (select 1 from orders o where o.id = d.order_id and o.paid_at is not null)
      order by d.custom_fields->>'event_date' limit ${limit})`);
  return rows.map((r) => ({ kind: r.kind, dealId: r.deal_id, conversationId: r.conversation_id, number: r.number, contact: r.contact, at: r.at, amount: r.amount }));
}
