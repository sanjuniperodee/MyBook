import "server-only";
import { sql } from "drizzle-orm";
import { executor } from "@/shared/infrastructure/database";

type Row = Record<string, unknown>;

/**
 * Аналитика продаж за период по воронке: итоги и прошлый период, каналы, этапы, отказы, менеджеры,
 * время ответа, звонки, честная воронка по истории этапов и время на этапах.
 */
export async function salesAnalytics(pipelineId: string, period: number) {
  const db = executor();
  const inPipeline = sql`s.pipeline_id = ${pipelineId}`;
  const since = sql`now() - make_interval(days => ${period})`;
  const prevSince = sql`now() - make_interval(days => ${period * 2})`;
  const pipeline = { id: pipelineId };
  const [totals, prevTotals, bySource, byStage, lost, managers, responses, calls, awaiting, reached, stageTime] = await Promise.all([
    db.execute<Row>(sql`
      select count(*)::int as created,
        count(*) filter (where s.kind = 'won')::int as won,
        count(*) filter (where s.kind = 'lost')::int as lost,
        coalesce(sum(d.amount) filter (where s.kind = 'won'), 0)::int as revenue,
        percentile_cont(0.5) within group (order by extract(epoch from d.closed_at - d.created_at)) filter (where s.kind = 'won') as cycle
      from crm_deals d join crm_stages s on s.id = d.stage_id where d.created_at >= ${since} and ${inPipeline}`),
    db.execute<Row>(sql`
      select count(*)::int as created, count(*) filter (where s.kind = 'won')::int as won, coalesce(sum(d.amount) filter (where s.kind = 'won'), 0)::int as revenue
      from crm_deals d join crm_stages s on s.id = d.stage_id where d.created_at >= ${prevSince} and d.created_at < ${since} and ${inPipeline}`),
    db.execute<Row>(sql`
      select d.source, d.utm, s.kind = 'won' as won, d.amount
      from crm_deals d join crm_stages s on s.id = d.stage_id where d.created_at >= ${since} and ${inPipeline}`),
    db.execute<Row>(sql`select d.stage_id, count(*)::int as n, coalesce(sum(d.amount), 0)::int as sum from crm_deals d where d.created_at >= ${since} group by d.stage_id`),
    db.execute<Row>(sql`
      select coalesce(nullif(d.lost_reason, ''), 'не указана') as reason, count(*)::int as n
      from crm_deals d join crm_stages s on s.id = d.stage_id where s.kind = 'lost' and d.closed_at >= ${since} and ${inPipeline}
      group by 1 order by n desc limit 8`),
    db.execute<Row>(sql`
      select u.id,
        (select count(*) from crm_deals d where d.assignee_id = u.id and d.created_at >= ${since})::int as deals,
        (select count(*) from crm_deals d join crm_stages s on s.id = d.stage_id where d.assignee_id = u.id and s.kind = 'won' and d.closed_at >= ${since})::int as won,
        (select coalesce(sum(d.amount), 0) from crm_deals d join crm_stages s on s.id = d.stage_id where d.assignee_id = u.id and s.kind = 'won' and d.closed_at >= ${since})::int as revenue,
        (select count(*) from crm_deals d join crm_stages s on s.id = d.stage_id where d.assignee_id = u.id and s.kind = 'open')::int as open,
        (select count(*) from crm_messages m where m.author_id = u.id and m.created_at >= ${since})::int as messages,
        (select count(*) from crm_calls c where c.staff_id = u.id and c.started_at >= ${since} and c.status = 'answered')::int as calls,
        (select coalesce(sum(c.duration_sec), 0) from crm_calls c where c.staff_id = u.id and c.started_at >= ${since})::int as talk,
        (select count(*) from crm_tasks t where t.assignee_id = u.id and t.done_at >= ${since})::int as tasks_done,
        (select count(*) from crm_tasks t where t.assignee_id = u.id and t.done_at is null and t.due_at < now())::int as tasks_overdue
      from users u where u.role = 'admin'`),
    // Время первого ответа: от входящего, открывшего «ожидание», до ближайшего исходящего.
    db.execute<Row>(sql`
      with m as (
        select id, conversation_id, direction, created_at, lag(direction) over (partition by conversation_id order by created_at) as prev
        from crm_messages where created_at >= ${prevSince}
      ), asks as (
        select conversation_id, created_at from m where direction = 'in' and (prev is null or prev = 'out') and created_at >= ${since}
      ), answers as (
        select a.created_at as asked, o.created_at as answered, o.author_id
        from asks a
        left join lateral (
          select created_at, author_id from crm_messages x
          where x.conversation_id = a.conversation_id and x.direction = 'out' and x.created_at > a.created_at
          order by x.created_at limit 1
        ) o on true
      )
      select author_id, count(*)::int as n,
        percentile_cont(0.5) within group (order by extract(epoch from answered - asked)) as median,
        count(*) filter (where answered is null)::int as unanswered
      from answers group by rollup(author_id)`),
    db.execute<Row>(sql`
      select count(*) filter (where direction = 'in')::int as incoming,
        count(*) filter (where direction = 'out')::int as outgoing,
        count(*) filter (where direction = 'in' and status = 'missed')::int as missed,
        count(*) filter (where direction = 'in' and status = 'missed' and handled_at is not null)::int as handled,
        coalesce(sum(duration_sec), 0)::int as talk
      from crm_calls where started_at >= ${since}`),
    db.execute<Row>(sql`select count(*)::int as n from crm_conversations where awaiting_since is not null and status = 'open'`),
    // Докуда дошла каждая сделка когорты (по истории этапов, а не по текущему положению).
    db.execute<{ max_open: number | null; won: boolean }>(sql`
      select max(case when hs.kind = 'open' then hs.position end) as max_open, bool_or(hs.kind = 'won') as won
      from crm_stage_history h
      join crm_stages hs on hs.id = h.to_stage_id
      join crm_deals d on d.id = h.deal_id
      join crm_stages s on s.id = d.stage_id
      where d.created_at >= ${since} and ${inPipeline} and hs.pipeline_id = ${pipeline.id}
      group by h.deal_id`),
    // Сколько сделки в среднем стоят на этапе (завершённые интервалы за период).
    db.execute<{ stage_id: string; avg_sec: number; n: number }>(sql`
      select to_stage_id as stage_id, avg(extract(epoch from next_at - created_at))::float as avg_sec, count(*)::int as n
      from (select to_stage_id, created_at, lead(created_at) over (partition by deal_id order by created_at) as next_at from crm_stage_history) x
      where next_at is not null and next_at >= ${since}
      group by to_stage_id`),
  ]);
  return { totals, prevTotals, bySource, byStage, lost, managers, responses, calls, awaiting, reached, stageTime };
}
