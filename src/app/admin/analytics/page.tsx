import { container } from "@/server/container";
import Link from "next/link";
import { currentMonth } from "@/modules/sales";
import { requireStaff } from "@/server/access";
import { staffLabel } from "@/shared/domain/staff";
import { channelOf, channels, toAttribution } from "@/shared/domain/channels";
import { formatPrice } from "@/config/site";
import { BarList, StatTile } from "@/components/admin/charts";
import { cn } from "@/lib/class-names";
import { formatDate } from "@/lib/dates";
import { getSetting } from "@/modules/workspace";
import { parseWorkHours } from "@/shared/domain/schedule";
import { responseStats, type ResponseGroup } from "@/modules/reporting/ui/response-stats";
import { shiftMinutes, slaMinutes, waitLabel } from "@/modules/reporting/ui/response-wait";

export const metadata = { title: "Аналитика продаж" };

type Row = Record<string, unknown>;

const periods = [7, 30, 90] as const;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const mins = (sec: number | null) => (sec === null || Number.isNaN(sec) ? "—" : sec < 60 ? `${Math.round(sec)} сек` : sec < 3600 ? `${Math.round(sec / 60)} мин` : `${(sec / 3600).toFixed(1).replace(".", ",")} ч`);

const num = (v: unknown) => Number(v ?? 0);

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ period?: string; p?: string }> }) {
  await requireStaff("analytics.view");
  const { period: raw, p: pipelineParam } = await searchParams;
  const pipelines = await container().sales.queries.listPipelines();
  const pipeline = pipelines.find((x) => x.id === pipelineParam) ?? pipelines[0];
  const period = periods.find((p) => String(p) === raw) ?? 30;
  const [stages, admins, { totals, prevTotals, received, bySource, byStage, lost, managers, responses, calls, awaiting, reached, stageTime }, hoursRaw, slaRaw] = await Promise.all([
    container().sales.queries.listStages(pipeline.id),
    container().access.queries.allStaff(),
    container().reporting.salesAnalytics(pipeline.id, period),
    getSetting("crm.workHours"),
    getSetting("crm.slaMinutes"),
  ]);
  // Скорость ответа людей в рабочих минутах (analytics-2): бот и правила — отдельно, заметки — не ответ, итог — по всем.
  const hours = parseWorkHours(hoursRaw);
  const sla = slaMinutes(slaRaw);
  const shift = shiftMinutes(hours);
  const resp = responseStats(
    responses.rows.map((r) => ({ conversationId: r.conversation_id, asked: new Date(r.asked), human: r.human ? new Date(r.human) : null, author: r.author_id, bot: r.bot ? new Date(r.bot) : null })),
    hours,
    sla,
    new Date(),
  );
  const workMins = (m: number | null) => (m === null ? "—" : waitLabel(Math.round(m), shift));
  const share = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
  const reachedStage = (st: { kind: string; position: number }) => reached.rows.filter((r) => r.won || (st.kind === "open" && r.max_open !== null && r.max_open >= st.position)).length;
  const plans = await container().sales.queries.planProgress(currentMonth());
  const timeByStage = new Map(stageTime.rows.map((r) => [r.stage_id, r]));

  const t = totals.rows[0] ?? {};
  const p = prevTotals.rows[0] ?? {};
  const change = (a: number, b: number) => (b ? (a - b) / b : a ? null : 0);
  const names = new Map(admins.map((a) => [a.id, staffLabel(a)]));

  // Каналы привлечения сделок: по UTM, если есть, иначе по источнику сделки (чат, звонок).
  const channelRows = [
    ...bySource.rows
      .reduce((acc, r) => {
        const key = channelOf(toAttribution(r.utm), String(r.source));
        const cur = acc.get(key) ?? { key, label: channels[key], created: 0, won: 0, revenue: 0 };
        cur.created++;
        // Деньги по ручным сделкам: с первого платежа сделка — продажа на сумму принятых денег; без платежей — успешная сделка на её сумму.
        if (num(r.paid) > 0) {
          cur.won++;
          cur.revenue += num(r.paid);
        } else if (r.won) {
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
    .map((r: Row): Row & { name: string; resp: ResponseGroup | undefined } => ({ ...r, name: names.get(String(r.id)) ?? "—", resp: resp.byAuthor.get(String(r.id)) }))
    .filter((r) => num(r.deals) || num(r.won) || num(r.messages) || num(r.phone_messages) || num(r.calls) || num(r.open) || num(r.received))
    .sort((a, b) => num(b.revenue) - num(a.revenue) || num(b.won) - num(a.won));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Аналитика продаж</h1>
          <a href={`/api/admin/export/payments?days=${period}`} className="text-xs text-wine hover:underline">
            Поступления денег, CSV
          </a>
          {pipelines.length > 1 ? (
            <div className="flex max-w-full overflow-x-auto rounded-xl border border-line bg-white p-0.5 text-sm">
              {pipelines.map((x) => (
                <Link key={x.id} href={`/admin/analytics?period=${period}&p=${x.id}`} className={cn("inline-flex min-h-10 items-center rounded-lg px-3 whitespace-nowrap lg:min-h-0 lg:py-1", x.id === pipeline.id ? "bg-ink text-white" : "text-ink-soft")}>
                  {x.name}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex max-w-full overflow-x-auto rounded-xl border border-line bg-white p-1 text-sm">
          {periods.map((x) => (
            <Link key={x} href={`/admin/analytics?period=${x}${pipelineParam ? `&p=${pipelineParam}` : ""}`} className={cn("inline-flex min-h-10 items-center rounded-lg px-3 whitespace-nowrap lg:min-h-0 lg:py-1.5", x === period ? "bg-ink text-white" : "text-ink-soft hover:bg-cream")}>
              {x} дней
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatTile label="Новых сделок" value={String(num(t.created))} delta={change(num(t.created), num(p.created))} hint={`от повторных клиентов: ${num(t.repeat_created)}`} />
        <StatTile label="Успешных" value={String(num(t.won))} delta={change(num(t.won), num(p.won))} hint={`новые клиенты ${num(t.won) - num(t.repeat_won)} · повторные ${num(t.repeat_won)}`} />
        <StatTile label="Конверсия в продажу" value={pct(num(t.won), num(t.created))} />
        <StatTile label="Выручка по сделкам" value={formatPrice(num(t.revenue))} delta={change(num(t.revenue), num(p.revenue))} hint={`суммы договорённостей по успешным сделкам; от повторных — ${formatPrice(num(t.repeat_revenue))}`} />
        <StatTile label="Получено деньгами" value={formatPrice(num(received.rows[0]?.cur))} delta={change(num(received.rows[0]?.cur), num(received.rows[0]?.prev))} hint="оплаченные заказы и платежи менеджеров" />
        <StatTile
          label="Первый ответ людей (медиана)"
          value={workMins(resp.total.median)}
          goodWhenUp={false}
          hint={`рабочих минут; в норматив ${sla} мин — ${share(resp.total.inSla)}; бот ответил первым ${resp.bot.first} раз${resp.bot.median !== null ? ` (медиана ${mins(resp.bot.median * 60)})` : ""}; ждут сейчас: ${num(awaiting.rows[0]?.n)}`}
        />
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
        <table className="w-full min-w-[980px] [&_tr>*:first-child]:sticky [&_tr>*:first-child]:left-0 [&_tr>*:first-child]:bg-white [&_tr>*:first-child]:z-[1] text-sm" data-testid="leaderboard">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="pb-2 font-medium">Сотрудник</th>
              <th className="pb-2 text-right font-medium">Новых сделок</th>
              <th className="pb-2 text-right font-medium">Продаж</th>
              <th className="pb-2 text-right font-medium">Выручка</th>
              <th className="pb-2 text-right font-medium">Получено</th>
              <th className="pb-2 text-right font-medium">В работе</th>
              <th className="pb-2 text-right font-medium" title="Из CRM / с телефона магазина">Сообщений: CRM / телефон</th>
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
                <td className="py-2.5 text-right tabular-nums">{formatPrice(num(r.received))}</td>
                <td className="py-2.5 text-right tabular-nums">{num(r.open)}</td>
                <td className="py-2.5 text-right tabular-nums">
                  {num(r.messages)} / {num(r.phone_messages)}
                </td>
                <td className="py-2.5 text-right tabular-nums" title={r.resp ? `ответов ${r.resp.answered}, в норматив ${share(r.resp.inSla)}` : undefined}>
                  {r.resp ? `${workMins(r.resp.median)} · ${share(r.resp.inSla)}` : "—"}
                </td>
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
        <p className="mt-3 text-xs text-muted">Ответы с телефона магазина засчитываются тому, у кого был телефон («Телефон WhatsApp у …» в «Чатах»), — приблизительно: кто держал телефон, тот и отвечал.</p>
      </section>

      {resp.longest.length ? (
        <section className="rounded-2xl border border-line bg-white p-5" data-testid="longest-waits">
          <h2 className="mb-1 font-semibold">Дольше всего ждали ответа</h2>
          <p className="mb-3 text-xs text-muted">Рабочих минут до первого ответа человека (из CRM или с телефона); бот и правила не в счёт.</p>
          <ul className="divide-y divide-line text-sm">
            {resp.longest.map((w) => (
              <li key={`${w.conversationId}:${w.asked.toISOString()}`}>
                <Link href={`/admin/chats?c=${w.conversationId}`} className="flex items-center gap-3 py-2 hover:text-wine">
                  <span className="w-40 shrink-0 text-xs text-muted">{formatDate(w.asked, true)}</span>
                  <span className={cn("flex-1", !w.answered && "text-red-700")}>{waitLabel(w.minutes, shift)}{w.answered ? "" : " — без ответа"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
            <Metric label="Вопросы без ответа людей" value={`${resp.total.unanswered} из ${resp.total.asked}`} warn={resp.total.unanswered > 0} />
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
