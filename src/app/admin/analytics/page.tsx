import { container } from "@/server/container";
import Link from "next/link";
import { currentMonth, planProgress } from "@/lib/crm/plans";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireStaff } from "@/server/access";
import { adminLabel, listAdmins } from "@/lib/crm";
import { channelOf, channels, toAttribution } from "@/lib/crm/channels";
import { formatPrice } from "@/config/site";
import { BarList, StatTile } from "@/components/admin/charts";
import { cn } from "@/lib/utils";

export const metadata = { title: "Аналитика продаж" };

const periods = [7, 30, 90] as const;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const mins = (sec: number | null) => (sec === null || Number.isNaN(sec) ? "—" : sec < 60 ? `${Math.round(sec)} сек` : sec < 3600 ? `${Math.round(sec / 60)} мин` : `${(sec / 3600).toFixed(1).replace(".", ",")} ч`);

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ period?: string; p?: string }> }) {
  await requireStaff("analytics.view");
  const { period: raw, p: pipelineParam } = await searchParams;
  const pipelines = await container().sales.queries.listPipelines();
  const pipeline = pipelines.find((x) => x.id === pipelineParam) ?? pipelines[0];
  const inPipeline = sql`s.pipeline_id = ${pipeline.id}`;
  const period = periods.find((p) => String(p) === raw) ?? 30;
  const since = sql`now() - make_interval(days => ${period})`;
  const prevSince = sql`now() - make_interval(days => ${period * 2})`;

  const [stages, admins, totals, prevTotals, bySource, byStage, lost, managers, responses, calls, awaiting, reached, stageTime] = await Promise.all([
    container().sales.queries.listStages(pipeline.id),
    listAdmins(),
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
  const reachedStage = (st: { kind: string; position: number }) => reached.rows.filter((r) => r.won || (st.kind === "open" && r.max_open !== null && r.max_open >= st.position)).length;
  const plans = await planProgress(currentMonth());
  const timeByStage = new Map(stageTime.rows.map((r) => [r.stage_id, r]));

  const t = totals.rows[0] ?? {};
  const p = prevTotals.rows[0] ?? {};
  const change = (a: number, b: number) => (b ? (a - b) / b : a ? null : 0);
  const names = new Map(admins.map((a) => [a.id, adminLabel(a)]));
  const respByAuthor = new Map(responses.rows.filter((r) => r.author_id).map((r) => [String(r.author_id), r]));
  const respAll = responses.rows.find((r) => r.author_id === null);
  // Каналы привлечения сделок: по UTM, если есть, иначе по источнику сделки (чат, звонок).
  const channelRows = [
    ...bySource.rows
      .reduce((acc, r) => {
        const key = channelOf(toAttribution(r.utm), String(r.source));
        const cur = acc.get(key) ?? { key, label: channels[key], created: 0, won: 0, revenue: 0 };
        cur.created++;
        if (r.won) {
          cur.won++;
          cur.revenue += num(r.amount);
        }
        return acc.set(key, cur);
      }, new Map<string, { key: string; label: string; created: number; won: number; revenue: number }>())
      .values(),
  ].sort((a, b) => b.revenue - a.revenue || b.created - a.created);
  const stageRows = new Map(byStage.rows.map((r) => [String(r.stage_id), r]));
  const c = calls.rows[0] ?? {};
  const team = managers.rows
    .map((r): Row & { name: string; resp: Row | undefined } => ({ ...r, name: names.get(String(r.id)) ?? "—", resp: respByAuthor.get(String(r.id)) }))
    .filter((r) => num(r.deals) || num(r.won) || num(r.messages) || num(r.calls) || num(r.open))
    .sort((a, b) => num(b.revenue) - num(a.revenue) || num(b.won) - num(a.won));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Аналитика продаж</h1>
          {pipelines.length > 1 ? (
            <div className="flex rounded-xl border border-line bg-white p-0.5 text-sm">
              {pipelines.map((x) => (
                <Link key={x.id} href={`/admin/analytics?period=${period}&p=${x.id}`} className={cn("rounded-lg px-3 py-1", x.id === pipeline.id ? "bg-ink text-white" : "text-ink-soft")}>
                  {x.name}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex rounded-xl border border-line bg-white p-1 text-sm">
          {periods.map((x) => (
            <Link key={x} href={`/admin/analytics?period=${x}${pipelineParam ? `&p=${pipelineParam}` : ""}`} className={cn("rounded-lg px-3 py-1.5", x === period ? "bg-ink text-white" : "text-ink-soft hover:bg-cream")}>
              {x} дней
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Новых сделок" value={String(num(t.created))} delta={change(num(t.created), num(p.created))} />
        <StatTile label="Успешных" value={String(num(t.won))} delta={change(num(t.won), num(p.won))} />
        <StatTile label="Конверсия в продажу" value={pct(num(t.won), num(t.created))} />
        <StatTile label="Выручка по сделкам" value={formatPrice(num(t.revenue))} delta={change(num(t.revenue), num(p.revenue))} />
        <StatTile label="Первый ответ (медиана)" value={mins(respAll?.median === undefined || respAll?.median === null ? null : num(respAll.median))} goodWhenUp={false} hint={`ждут ответа сейчас: ${num(awaiting.rows[0]?.n)}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white p-5" data-testid="funnel">
          <h2 className="mb-1 font-semibold">Воронка{pipelines.length > 1 ? ` · ${pipeline.name}` : ""}</h2>
          <p className="mb-4 text-xs text-muted">
            Сколько сделок, созданных за период, дошли до этапа (по истории переходов), конверсия из предыдущего этапа и сколько в среднем сделка стоит на этапе. Средний цикл до продажи:{" "}
            {mins(t.cycle === null || t.cycle === undefined ? null : num(t.cycle))}.
          </p>
          <div className="space-y-2.5">
            {stages
              .filter((st) => st.kind !== "lost")
              .map((st, i, list) => {
                const n = st.kind === "won" ? reached.rows.filter((r) => r.won).length : reachedStage(st);
                const prevN = i > 0 ? (list[i - 1].kind === "won" ? reached.rows.filter((r) => r.won).length : reachedStage(list[i - 1])) : null;
                const base = reached.rows.length;
                const time = timeByStage.get(st.id);
                return (
                  <div key={st.id} className="text-sm">
                    <div className="mb-1 flex justify-between gap-3">
                      <span>{st.name}</span>
                      <span className="text-muted tabular-nums">
                        {n}
                        {prevN !== null ? ` · ${pct(n, prevN)} из пред.` : ""}
                        {time && st.kind === "open" ? ` · ${mins(time.avg_sec)} на этапе` : ""}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-cream">
                      <div className="h-full rounded-full" style={{ width: `${base ? Math.max((n / base) * 100, n ? 3 : 0) : 0}%`, background: st.color }} />
                    </div>
                  </div>
                );
              })}
            <div className="flex justify-between border-t border-line pt-2 text-xs text-muted">
              <span>Отказ</span>
              <span className="tabular-nums">
                {num(t.lost)} · сейчас в работе {stages.filter((st) => st.kind === "open").reduce((sum, st) => sum + num(stageRows.get(st.id)?.n), 0)}
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="mb-4 font-semibold">Каналы: откуда приходят и что продают</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="pb-2 font-medium">Канал</th>
                <th className="pb-2 text-right font-medium">Сделок</th>
                <th className="pb-2 text-right font-medium">Продаж</th>
                <th className="pb-2 text-right font-medium">Конверсия</th>
                <th className="pb-2 text-right font-medium">Выручка</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {channelRows.map((r) => (
                <tr key={r.key}>
                  <td className="py-2">{r.label}</td>
                  <td className="py-2 text-right tabular-nums">{r.created}</td>
                  <td className="py-2 text-right tabular-nums">{r.won}</td>
                  <td className="py-2 text-right tabular-nums">{pct(r.won, r.created)}</td>
                  <td className="py-2 text-right tabular-nums">{formatPrice(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Link href="/admin/marketing" className="mt-3 inline-block text-xs text-wine hover:underline">
            Ссылки с UTM и отчёт по кампаниям →
          </Link>
          {bySource.rows.length === 0 ? <p className="py-4 text-sm text-muted">Сделок за период нет.</p> : null}
        </section>
      </div>

      <section className="overflow-x-auto rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-4 font-semibold">Менеджеры</h2>
        <table className="w-full min-w-[900px] text-sm" data-testid="leaderboard">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="pb-2 font-medium">Сотрудник</th>
              <th className="pb-2 text-right font-medium">Новых сделок</th>
              <th className="pb-2 text-right font-medium">Продаж</th>
              <th className="pb-2 text-right font-medium">Выручка</th>
              <th className="pb-2 text-right font-medium">В работе</th>
              <th className="pb-2 text-right font-medium">Сообщений</th>
              <th className="pb-2 text-right font-medium">Первый ответ</th>
              <th className="pb-2 text-right font-medium">Разговоров</th>
              <th className="pb-2 text-right font-medium">На линии</th>
              <th className="pb-2 text-right font-medium">Задачи: сделано / просрочено</th>
              <th className="pb-2 text-right font-medium">План месяца</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {team.map((r) => (
              <tr key={String(r.id)}>
                <td className="py-2.5 font-medium">{r.name}</td>
                <td className="py-2.5 text-right tabular-nums">{num(r.deals)}</td>
                <td className="py-2.5 text-right tabular-nums">{num(r.won)}</td>
                <td className="py-2.5 text-right tabular-nums">{formatPrice(num(r.revenue))}</td>
                <td className="py-2.5 text-right tabular-nums">{num(r.open)}</td>
                <td className="py-2.5 text-right tabular-nums">{num(r.messages)}</td>
                <td className="py-2.5 text-right tabular-nums">{r.resp ? mins(num(r.resp.median)) : "—"}</td>
                <td className="py-2.5 text-right tabular-nums">{num(r.calls)}</td>
                <td className="py-2.5 text-right tabular-nums">{Math.round(num(r.talk) / 60)} мин</td>
                <td className={cn("py-2.5 text-right tabular-nums", num(r.tasks_overdue) && "text-red-700")}>
                  {num(r.tasks_done)} / {num(r.tasks_overdue)}
                </td>
                <td className="py-2.5 text-right tabular-nums">
                  {(() => {
                    const pl = plans.get(String(r.id));
                    return pl?.planAmount ? `${Math.round((pl.factAmount / pl.planAmount) * 100)}%` : "—";
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {team.length === 0 ? <p className="py-4 text-sm text-muted">Активности за период нет.</p> : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="mb-4 font-semibold">Причины отказов</h2>
          {lost.rows.length ? <BarList rows={lost.rows.map((r) => ({ label: String(r.reason), value: num(r.n) }))} /> : <p className="text-sm text-muted">Отказов за период нет.</p>}
        </section>
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="mb-4 font-semibold">Телефония</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Metric label="Входящих" value={num(c.incoming)} />
            <Metric label="Исходящих" value={num(c.outgoing)} />
            <Metric label="Пропущено" value={`${num(c.missed)} (${pct(num(c.missed), num(c.incoming))})`} warn={num(c.missed) > 0} />
            <Metric label="Обработано пропущенных" value={pct(num(c.handled), num(c.missed))} />
            <Metric label="Минут на линии" value={Math.round(num(c.talk) / 60)} />
            <Metric label="Чаты без ответа" value={`${num(respAll?.unanswered)} из ${num(respAll?.n)}`} warn={num(respAll?.unanswered) > 0} />
          </dl>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-cream/60 p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cn("mt-0.5 text-lg font-semibold tabular-nums", warn && "text-red-700")}>{value}</dd>
    </div>
  );
}
