import { container } from "@/server/container";
import Link from "next/link";
import { currentMonth } from "@/modules/sales";
import { requireStaff } from "@/server/access";
import { staffLabel } from "@/shared/domain/staff";
import { channelOf, channels, toAttribution } from "@/shared/domain/channels";
import { formatPrice } from "@/config/site";
import { BarList, StatRow, StatTile } from "@/components/admin/charts";
import { CircleCheck, Download, Link2, Users } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Segmented } from "@/components/admin/Segmented";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
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

/** Отступы первой и последней колонки таблицы — по полям листа. */
const EDGE = "[&_td:first-child]:pl-4 [&_th:first-child]:pl-4 sm:[&_td:first-child]:pl-5 sm:[&_th:first-child]:pl-5 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4 sm:[&_td:last-child]:pr-5 sm:[&_th:last-child]:pr-5";

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

  const pipeLink = (x: { id: string }) => `/admin/analytics?period=${period}&p=${x.id}`;
  const inWork = stages.filter((st) => st.kind === "open").reduce((sum, st) => sum + num(stageRows.get(st.id)?.n), 0);
  const planPct = (id: string) => {
    const pl = plans.get(id);
    return pl?.planAmount ? `${Math.round((pl.factAmount / pl.planAmount) * 100)}%` : "—";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Аналитика продаж"
        actions={
          <a href={`/api/admin/export/payments?days=${period}`} className="btn btn-outline btn-sm">
            <Download className="size-4" strokeWidth={1.8} aria-hidden /> Поступления, CSV
          </a>
        }
      >
        Сделки, созданные за период: сколько дошли до продажи, откуда пришли и как работают менеджеры.
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Период" items={periods.map((x) => ({ key: String(x), label: `${x} дней`, href: `/admin/analytics?period=${x}${pipelineParam ? `&p=${pipelineParam}` : ""}`, active: x === period }))} />
        {pipelines.length > 1 ? <Segmented label="Воронка" items={pipelines.map((x) => ({ key: x.id, label: x.name, href: pipeLink(x), active: x.id === pipeline.id }))} /> : null}
      </div>

      <section aria-labelledby="kpi-h" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="kpi-h" className="text-lg font-semibold">
            Итоги за {period} дней
          </h2>
          <span className="text-xs text-muted">к прошлым {period} дням</span>
        </div>
        <StatRow cols={3}>
          <StatTile bare label="Новых сделок" value={String(num(t.created))} delta={change(num(t.created), num(p.created))} hint={`от повторных клиентов: ${num(t.repeat_created)}`} />
          <StatTile bare label="Успешных" value={String(num(t.won))} delta={change(num(t.won), num(p.won))} hint={`новые клиенты ${num(t.won) - num(t.repeat_won)}, повторные ${num(t.repeat_won)}`} />
          <StatTile bare label="Конверсия в продажу" value={pct(num(t.won), num(t.created))} hint={`средний цикл ${mins(t.cycle === null || t.cycle === undefined ? null : num(t.cycle))}`} />
          <StatTile bare label="Выручка по сделкам" value={formatPrice(num(t.revenue))} delta={change(num(t.revenue), num(p.revenue))} hint={`по договорённостям; от повторных ${formatPrice(num(t.repeat_revenue))}`} />
          <StatTile
            bare
            label="Получено деньгами"
            value={formatPrice(num(received.rows[0]?.cur))}
            delta={change(num(received.rows[0]?.cur), num(received.rows[0]?.prev))}
            hint={num(received.rows[0]?.agreed) ? `в т.ч. ${formatPrice(num(received.rows[0]?.agreed))} — успешные сделки без платежа` : "оплаченные заказы и платежи менеджеров"}
          />
          <StatTile bare label="Первый ответ людей, медиана" value={workMins(resp.total.median)} goodWhenUp={false} hint={`в норматив ${sla} мин — ${share(resp.total.inSla)}; ждут сейчас ${num(awaiting.rows[0]?.n)}`} />
        </StatRow>
        <p className="text-xs text-muted">
          Время ответа — в рабочих минутах. Бот ответил первым {resp.bot.first} раз{resp.bot.median !== null ? ` (медиана ${mins(resp.bot.median * 60)})` : ""}; бот и правила в медиану людей не входят.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Panel title={`Воронка${pipelines.length > 1 ? `: ${pipeline.name}` : ""}`} description="Сколько сделок за период дошли до этапа, конверсия из предыдущего и среднее время на этапе">
          <ol className="space-y-3" data-testid="funnel">
            {stages
              .filter((st) => st.kind !== "lost")
              .map((st, i, list) => {
                const n = st.kind === "won" ? reached.rows.filter((r) => r.won).length : reachedStage(st);
                const prevN = i > 0 ? (list[i - 1].kind === "won" ? reached.rows.filter((r) => r.won).length : reachedStage(list[i - 1])) : null;
                const base = reached.rows.length;
                const time = timeByStage.get(st.id);
                return (
                  <li key={st.id} className="text-sm">
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-ink-soft">{st.name}</span>
                      <span className="shrink-0 tabular-nums">
                        <span className="font-medium">{n}</span>
                        {prevN !== null ? <span className="ml-1.5 text-xs text-muted">{pct(n, prevN)} из пред.</span> : null}
                        {time && st.kind === "open" ? <span className="ml-1.5 text-xs text-muted">{mins(time.avg_sec)} на этапе</span> : null}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-sunken">
                      <div className={cn("h-full rounded-full", st.kind === "won" ? "bg-success" : "bg-wine")} style={{ width: `${base ? Math.max((n / base) * 100, n ? 1.5 : 0) : 0}%` }} />
                    </div>
                  </li>
                );
              })}
          </ol>
          <div className="mt-4 flex justify-between gap-3 border-t border-line pt-3 text-xs text-muted">
            <span>Отказ: {num(t.lost)}</span>
            <span className="tabular-nums">сейчас в работе {inWork}</span>
          </div>
        </Panel>

        <Panel
          flush
          title="Каналы"
          description="Откуда приходят сделки и что продают"
          actions={
            <Link href="/admin/marketing" className="btn btn-ghost btn-sm">
              Ссылки и кампании
            </Link>
          }
        >
          {channelRows.length ? (
            <div className="overflow-x-auto">
              <table className={cn("table min-w-[480px]", EDGE)}>
                <thead>
                  <tr>
                    <th>Канал</th>
                    <th className="text-right">Сделок</th>
                    <th className="text-right">Продаж</th>
                    <th className="text-right">Конверсия</th>
                    <th className="text-right">Выручка</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {channelRows.map((r) => (
                    <tr key={r.key}>
                      <td className="font-medium">{r.label}</td>
                      <td className="text-right">{r.created}</td>
                      <td className="text-right">{r.won}</td>
                      <td className="text-right text-muted">{pct(r.won, r.created)}</td>
                      <td className="text-right font-medium">{formatPrice(r.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState compact icon={Link2} title="Сделок за период нет" action={<Link href="/admin/marketing" className="btn btn-outline btn-sm">Создать ссылку с UTM-метками</Link>}>
              Каналы появятся, когда придут заявки из чатов, звонков или по ссылкам.
            </EmptyState>
          )}
        </Panel>
      </div>

      <Panel flush title="Менеджеры" description="Ответы с телефона магазина засчитываются тому, у кого был телефон («Телефон WhatsApp у …» в «Чатах»), — приблизительно">
        {team.length ? (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className={cn("table min-w-[960px] [&_tr>*:first-child]:sticky [&_tr>*:first-child]:left-0 [&_tr>*:first-child]:z-[1] [&_tr>*:first-child]:bg-white", EDGE)} data-testid="leaderboard">
                <thead>
                  <tr>
                    <th>Сотрудник</th>
                    <th className="text-right">Новых сделок</th>
                    <th className="text-right">Продаж</th>
                    <th className="text-right">Выручка</th>
                    <th className="text-right">Получено</th>
                    <th className="text-right">В работе</th>
                    <th className="text-right" title="Из CRM / с телефона магазина">
                      Сообщений CRM / тел.
                    </th>
                    <th className="text-right">Первый ответ</th>
                    <th className="text-right">Разговоров</th>
                    <th className="text-right">На линии</th>
                    <th className="text-right" title="Сделано / просрочено">
                      Задачи
                    </th>
                    <th className="text-right">План</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums [&_td]:whitespace-nowrap">
                  {team.map((r) => (
                    <tr key={String(r.id)}>
                      <td className="font-medium whitespace-nowrap">{r.name}</td>
                      <td className="text-right">{num(r.deals)}</td>
                      <td className="text-right">{num(r.won)}</td>
                      <td className="text-right font-medium">{formatPrice(num(r.revenue))}</td>
                      <td className="text-right" title={num(r.received_agreed) ? `в т.ч. ${formatPrice(num(r.received_agreed))} — успешные сделки без платежа в журнале` : undefined}>
                        {formatPrice(num(r.received))}
                        {num(r.received_agreed) ? <div className="text-[11px] text-warning">без платежа {formatPrice(num(r.received_agreed))}</div> : null}
                      </td>
                      <td className="text-right">{num(r.open)}</td>
                      <td className="text-right">
                        {num(r.messages)} / {num(r.phone_messages)}
                      </td>
                      <td className="text-right whitespace-nowrap" title={r.resp ? `ответов ${r.resp.answered}, в норматив ${share(r.resp.inSla)}` : undefined}>
                        {r.resp ? (
                          <>
                            {workMins(r.resp.median)} <span className="text-muted">{share(r.resp.inSla)}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="text-right">{num(r.calls)}</td>
                      <td className="text-right whitespace-nowrap">{Math.round(num(r.talk) / 60)} мин</td>
                      <td className="text-right">
                        {num(r.tasks_done)} / <span className={num(r.tasks_overdue) ? "font-medium text-danger" : undefined}>{num(r.tasks_overdue)}</span>
                      </td>
                      <td className="text-right">{planPct(String(r.id))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line lg:hidden">
              {team.map((r) => (
                <li key={String(r.id)} className="space-y-2 px-4 py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-medium">{r.name}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{formatPrice(num(r.revenue))}</span>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-[13px] tabular-nums">
                    <Cell label="Сделок" value={num(r.deals)} />
                    <Cell label="Продаж" value={num(r.won)} />
                    <Cell label="План" value={planPct(String(r.id))} />
                    <Cell label="Получено" value={formatPrice(num(r.received))} />
                    <Cell label="Ответ" value={r.resp ? workMins(r.resp.median) : "—"} />
                    <Cell label="Просрочено" value={num(r.tasks_overdue)} warn={num(r.tasks_overdue) > 0} />
                  </dl>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <EmptyState compact icon={Users} title="Активности за период нет">
            Здесь появятся сделки, сообщения, звонки и задачи каждого менеджера.
          </EmptyState>
        )}
      </Panel>

      {resp.longest.length ? (
        <Panel flush title="Дольше всего ждали ответа" description="Рабочих минут до первого ответа человека (из CRM или с телефона); бот и правила не в счёт">
          <ul className="divide-y divide-line text-sm" data-testid="longest-waits">
            {resp.longest.map((w) => (
              <li key={`${w.conversationId}:${w.asked.toISOString()}`}>
                <Link href={`/admin/chats?c=${w.conversationId}`} className="flex min-h-12 items-center gap-3 px-4 py-2.5 hover:bg-sunken/60 sm:px-5">
                  <span className="w-36 shrink-0 text-xs text-muted sm:w-44">{formatDate(w.asked, true)}</span>
                  <span className="min-w-0 flex-1 tabular-nums">{waitLabel(w.minutes, shift)}</span>
                  {w.answered ? null : <Badge tone="danger">без ответа</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Причины отказов">
          {lost.rows.length ? (
            <BarList rows={lost.rows.map((r) => ({ label: String(r.reason), value: num(r.n) }))} />
          ) : (
            <EmptyState compact icon={CircleCheck} title="Отказов за период нет">
              Причину выбирают, когда переводят сделку в «Отказ».
            </EmptyState>
          )}
        </Panel>
        <Panel flush title="Телефония и ответы">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-b-[14px] bg-line sm:grid-cols-3">
            <Metric label="Входящих" value={num(c.incoming)} />
            <Metric label="Исходящих" value={num(c.outgoing)} />
            <Metric label="Пропущено" value={`${num(c.missed)}`} note={pct(num(c.missed), num(c.incoming))} warn={num(c.missed) > 0} />
            <Metric label="Перезвонили" value={pct(num(c.handled), num(c.missed))} note="из пропущенных" />
            <Metric label="Минут на линии" value={Math.round(num(c.talk) / 60)} />
            <Metric label="Вопросы без ответа" value={resp.total.unanswered} note={`из ${resp.total.asked}`} warn={resp.total.unanswered > 0} />
          </dl>
        </Panel>
      </div>
    </div>
  );
}

function Cell({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cn("truncate font-medium", warn && "text-danger")}>{value}</dd>
    </div>
  );
}

function Metric({ label, value, note, warn }: { label: string; value: string | number; note?: string; warn?: boolean }) {
  return (
    <div className="bg-white p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-1.5">
        <span className={cn("text-xl font-semibold tabular-nums", warn && "text-danger")}>{value}</span>
        {note ? <span className="text-xs text-muted">{note}</span> : null}
      </dd>
    </div>
  );
}
