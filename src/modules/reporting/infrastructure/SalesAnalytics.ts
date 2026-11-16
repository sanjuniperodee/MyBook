import "server-only";
import { sql } from "drizzle-orm";
import { executor } from "@/shared/infrastructure/database";

type Row = Record<string, unknown>;

/**
 * Аналитика продаж за период по воронке: итоги и прошлый период, каналы, этапы, отказы, менеджеры,
 * время ответа, звонки, честная воронка по истории этапов и время на этапах.
 */
export async function salesAnalytics(pipelineId: string, period: number | { from: Date; to: Date; prev: { from: Date; to: Date } }) {
  const db = executor();
  const inPipeline = sql`s.pipeline_id = ${pipelineId}`;
  // Период — даты «с … по …» как в «Финансах» и «Прибыли» (или последние N дней — для старых вызовов).
  const range = typeof period === "number" ? { from: new Date(Date.now() - period * 86_400_000), to: new Date(Date.now() + 60_000), prev: { from: new Date(Date.now() - period * 2 * 86_400_000), to: new Date(Date.now() - period * 86_400_000) } } : period;
  const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;
  const since = ts(range.from);
  const until = ts(range.to);
  const prevSince = ts(range.prev.from);
  const prevUntil = ts(range.prev.to);
  /** Колонка в периоде: [from, to). */
  const within = (col: string) => sql`${sql.raw(col)} >= ${since} and ${sql.raw(col)} < ${until}`;
  const pipeline = { id: pipelineId };
  const [totals, prevTotals, received, bySource, byStage, lost, managers, responses, calls, awaiting, reached, stageTime] = await Promise.all([
    db.execute<Row>(sql`
      select count(*)::int as created,
        count(*) filter (where s.kind = 'won')::int as won,
        count(*) filter (where s.kind = 'lost')::int as lost,
        coalesce(sum(d.amount) filter (where s.kind = 'won'), 0)::int as revenue,
        -- Новые и повторные клиенты (deals-24): повторный — у клиента были покупки до сделки.
        count(*) filter (where d.repeat_count > 0)::int as repeat_created,
        count(*) filter (where s.kind = 'won' and d.repeat_count > 0)::int as repeat_won,
        coalesce(sum(d.amount) filter (where s.kind = 'won' and d.repeat_count > 0), 0)::int as repeat_revenue,
        percentile_cont(0.5) within group (order by extract(epoch from d.closed_at - d.created_at)) filter (where s.kind = 'won') as cycle
      from crm_deals d join crm_stages s on s.id = d.stage_id where ${within("d.created_at")} and ${inPipeline}`),
    db.execute<Row>(sql`
      select count(*)::int as created, count(*) filter (where s.kind = 'won')::int as won, coalesce(sum(d.amount) filter (where s.kind = 'won'), 0)::int as revenue
      from crm_deals d join crm_stages s on s.id = d.stage_id where d.created_at >= ${prevSince} and d.created_at < ${prevUntil} and ${inPipeline}`),
    // Деньги по сделкам воронки (оплаченные заказы и платежи менеджеров) — в отличие от «выручки по сделкам», которая
    // считает суммы договорённостей по успешным сделкам. Успешная сделка без заказа и без платежей входит в журнал своей
    // суммой — agreed, подписываем на экране (analytics-d6).
    db.execute<Row>(sql`
      select coalesce(sum(e.amount) filter (where ${within("e.at")}), 0)::int as cur,
        coalesce(sum(e.amount) filter (where ${within("e.at")} and e.kind = 'deal'), 0)::int as agreed,
        coalesce(sum(e.amount) filter (where e.at >= ${prevSince} and e.at < ${prevUntil}), 0)::int as prev
      from revenue_events e join crm_deals d on d.id = e.deal_id join crm_stages s on s.id = d.stage_id
      where e.at >= ${prevSince} and e.at < ${until} and ${inPipeline}`),
    db.execute<Row>(sql`
      select d.source, d.utm, s.kind = 'won' as won, d.amount,
        coalesce((select sum(case when p.kind = 'refund' then -p.amount else p.amount end) from crm_payments p where p.deal_id = d.id), 0)::int as paid
      from crm_deals d join crm_stages s on s.id = d.stage_id where ${within("d.created_at")} and ${inPipeline}`),
    db.execute<Row>(sql`select d.stage_id, count(*)::int as n, coalesce(sum(d.amount), 0)::int as sum from crm_deals d where ${within("d.created_at")} group by d.stage_id`),
    db.execute<Row>(sql`
      select coalesce(nullif(d.lost_reason, ''), 'не указана') as reason, count(*)::int as n
      from crm_deals d join crm_stages s on s.id = d.stage_id where s.kind = 'lost' and ${within("d.closed_at")} and ${inPipeline}
      group by 1 order by n desc limit 8`),
    db.execute<Row>(sql`
      select u.id,
        (select count(*) from crm_deals d where d.assignee_id = u.id and ${within("d.created_at")})::int as deals,
        (select count(*) from crm_deals d join crm_stages s on s.id = d.stage_id where d.assignee_id = u.id and s.kind = 'won' and ${within("d.closed_at")})::int as won,
        (select coalesce(sum(d.amount), 0) from crm_deals d join crm_stages s on s.id = d.stage_id where d.assignee_id = u.id and s.kind = 'won' and ${within("d.closed_at")})::int as revenue,
        (select coalesce(sum(e.amount), 0) from revenue_events e where e.manager_id = u.id and ${within("e.at")})::int as received,
        (select coalesce(sum(e.amount), 0) from revenue_events e where e.manager_id = u.id and ${within("e.at")} and e.kind = 'deal')::int as received_agreed,
        (select count(*) from crm_deals d join crm_stages s on s.id = d.stage_id where d.assignee_id = u.id and s.kind = 'open')::int as open,
        (select count(*) from crm_messages m where m.author_id = u.id and ${within("m.created_at")} and m.internal = false)::int as messages,
        -- Ответы с телефона магазина, пока телефон был у сотрудника (analytics-1, analytics-d3).
        (select count(*) from crm_messages m where m.author_id is null and m.attributed_to = u.id and m.source is null and ${within("m.created_at")} and m.internal = false)::int as phone_messages,
        (select count(*) from crm_calls c where c.staff_id = u.id and ${within("c.started_at")} and c.status = 'answered')::int as calls,
        (select coalesce(sum(c.duration_sec), 0) from crm_calls c where c.staff_id = u.id and ${within("c.started_at")})::int as talk,
        (select count(*) from crm_tasks t where t.assignee_id = u.id and ${within("t.done_at")})::int as tasks_done,
        (select count(*) from crm_tasks t where t.assignee_id = u.id and t.done_at is null and t.due_at < now())::int as tasks_overdue
      from users u where u.role = 'admin'`),
    // Первый ответ на вопрос клиента (analytics-2): от входящего, открывшего ожидание (первое после нашего ответа или
    // первое вообще), до первого ответа человека (source is null — из CRM или эхо с телефона) и отдельно — бота или правила.
    // Заметки (internal) — не ответ и не ожидание. Ожидание в рабочих минутах считает responseStats.
    db.execute<{ conversation_id: string; asked: Date; human: Date | null; author_id: string | null; bot: Date | null }>(sql`
      with m as (
        select conversation_id, direction, created_at, lag(direction) over (partition by conversation_id order by created_at) as prev
        from crm_messages where created_at >= ${prevSince} and created_at < ${until} and internal = false
      ), asks as (
        select conversation_id, created_at from m where direction = 'in' and (prev is null or prev = 'out') and ${within("created_at")}
      )
      select a.conversation_id, a.created_at as asked, h.created_at as human, coalesce(h.author_id, h.attributed_to) as author_id, b.created_at as bot
      from asks a
      left join lateral (
        select created_at, author_id, attributed_to from crm_messages x
        where x.conversation_id = a.conversation_id and x.direction = 'out' and x.internal = false and x.source is null and x.created_at > a.created_at
        order by x.created_at limit 1
      ) h on true
      left join lateral (
        select created_at from crm_messages x
        where x.conversation_id = a.conversation_id and x.direction = 'out' and x.internal = false and x.source is not null and x.created_at > a.created_at
        order by x.created_at limit 1
      ) b on true
      order by a.created_at desc
      limit 5000`),
    db.execute<Row>(sql`
      select count(*) filter (where direction = 'in')::int as incoming,
        count(*) filter (where direction = 'out')::int as outgoing,
        count(*) filter (where direction = 'in' and status = 'missed')::int as missed,
        count(*) filter (where direction = 'in' and status = 'missed' and handled_at is not null)::int as handled,
        coalesce(sum(duration_sec), 0)::int as talk
      from crm_calls where ${within("started_at")}`),
    db.execute<Row>(sql`select count(*)::int as n from crm_conversations where awaiting_since is not null and status = 'open'`),
    // Докуда дошла каждая сделка когорты (по истории этапов, а не по текущему положению).
    db.execute<{ max_open: number | null; won: boolean }>(sql`
      select max(case when hs.kind = 'open' then hs.position end) as max_open, bool_or(hs.kind = 'won') as won
      from crm_stage_history h
      join crm_stages hs on hs.id = h.to_stage_id
      join crm_deals d on d.id = h.deal_id
      join crm_stages s on s.id = d.stage_id
      where ${within("d.created_at")} and ${inPipeline} and hs.pipeline_id = ${pipeline.id}
      group by h.deal_id`),
    // Сколько сделки в среднем стоят на этапе (завершённые интервалы за период).
    db.execute<{ stage_id: string; avg_sec: number; n: number }>(sql`
      select to_stage_id as stage_id, avg(extract(epoch from next_at - created_at))::float as avg_sec, count(*)::int as n
      from (select to_stage_id, created_at, lead(created_at) over (partition by deal_id order by created_at) as next_at from crm_stage_history) x
      where next_at is not null and ${within("next_at")}
      group by to_stage_id`),
  ]);
  return { totals, prevTotals, received, bySource, byStage, lost, managers, responses, calls, awaiting, reached, stageTime };
}
