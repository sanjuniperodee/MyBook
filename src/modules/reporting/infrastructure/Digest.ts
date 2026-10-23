import "server-only";
import { sql } from "drizzle-orm";
import { executor } from "@/shared/infrastructure/database";
import { iso, localDay } from "./time";

/** Цифры утренней сводки (bots-11, tasks-20): что ждёт с ночи и что горит в ближайшие дни. */
export interface MorningDigest {
  /** Клиенты ждут ответа дольше норматива. */
  waiting: number;
  /** «Я оплатил» — по заказу с сайта или счёту из чата, а оплата ещё не принята. */
  claims: number;
  /** До даты события (сделки) или желаемой даты (заказы) — 3 дня и меньше. */
  deadlines: number;
  /** Ночь бота (последние 12 часов): сколько бесед он вёл и скольких передал человеку. */
  botChats: number;
  botHandoffs: number;
}

export const DIGEST_DEADLINE_DAYS = 3;

/** Один запрос по частичным индексам ожидания, заявок «оплатил» и дат; журнал бота — по created_at. */
export async function morningDigest(slaMinutes: number): Promise<MorningDigest> {
  const until = iso(localDay(DIGEST_DEADLINE_DAYS));
  const today = iso(localDay(0));
  const { rows } = await executor().execute<{ waiting: number; claims: number; deadlines: number; bot_chats: number; bot_handoffs: number }>(sql`
    select
      (select count(*) from crm_conversations c where c.awaiting_since is not null and c.status = 'open' and c.awaiting_since <= now() - make_interval(mins => ${Math.max(1, Math.floor(slaMinutes))}))::int as waiting,
      ((select count(*) from orders o where o.status = 'pending_payment' and o.payment_claimed_at is not null)
        + (select count(*) from deal_invoices i where i.status = 'pending_payment' and i.claimed_at is not null))::int as claims,
      ((select count(*) from crm_deals d join crm_stages s on s.id = d.stage_id and s.kind = 'open'
          where (d.custom_fields->>'event_date') >= ${today} and (d.custom_fields->>'event_date') <= ${until})
        + (select count(*) from orders o where o.desired_date is not null and o.desired_date <= ${until} and o.status in ('pending_payment', 'paid', 'in_production')))::int as deadlines,
      (select count(distinct e.conversation_id) from crm_bot_events e where e.kind in ('started', 'takeover', 'turn') and e.created_at >= now() - interval '12 hours')::int as bot_chats,
      (select count(distinct e.conversation_id) from crm_bot_events e where e.kind = 'handoff' and e.created_at >= now() - interval '12 hours')::int as bot_handoffs`);
  const r = rows[0];
  return { waiting: r?.waiting ?? 0, claims: r?.claims ?? 0, deadlines: r?.deadlines ?? 0, botChats: r?.bot_chats ?? 0, botHandoffs: r?.bot_handoffs ?? 0 };
}
