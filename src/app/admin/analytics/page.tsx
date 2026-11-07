import { container } from "@/server/container";
import Link from "next/link";
import { currentMonth } from "@/modules/sales";
import { requireStaff } from "@/server/access";
import { staffLabel } from "@/shared/domain/staff";
import { channelOf, channels, toAttribution } from "@/shared/domain/channels";
import { formatPrice } from "@/config/site";
import { BarList, StatRow, StatTile } from "@/components/admin/charts";
import { SectionHead } from "@/components/admin/SectionHead";
import { Facts } from "@/components/ui/Facts";
import { BarCell, ShareBar } from "./kit";
import { CircleCheck, Download, Link2, Users } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Segmented } from "@/components/admin/Segmented";
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

  const base = reached.rows.length;
  const wonReached = reached.rows.filter((r) => r.won).length;
  const funnel = stages
    .filter((st) => st.kind !== "lost")
    .map((st, i, list) => {
      const n = st.kind === "won" ? wonReached : reachedStage(st);
      const prevN = i > 0 ? (list[i - 1].kind === "won" ? wonReached : reachedStage(list[i - 1])) : null;
      return { st, n, prevN, time: timeByStage.get(st.id) };
    });
  const maxRevenue = Math.max(...channelRows.map((r) => r.revenue), 0);
  const maxTeamRevenue = Math.max(...team.map((r) => num(r.revenue)), 0);

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
        <span className="text-xs text-muted sm:ml-auto">Изменение — к прошлым {period} дням</span>
      </div>

      <section aria-label={`Итоги за ${period} дней`} className="space-y-2">
        <StatRow cols={3} className="xl:grid-cols-6">
          <StatTile bare label="Выручка по сделкам" value={formatPrice(num(t.revenue))} delta={change(num(t.revenue), num(p.revenue))} hint={`по договорённостям; от повторных ${formatPrice(num(t.repeat_revenue))}`} />
          <StatTile
            bare
            label="Получено деньгами"
            value={formatPrice(num(received.rows[0]?.cur))}
            delta={change(num(received.rows[0]?.cur), num(received.rows[0]?.prev))}
            hint={num(received.rows[0]?.agreed) ? `в т.ч. ${formatPrice(num(received.rows[0]?.agreed))} — успешные сделки без платежа` : "оплаченные заказы и платежи менеджеров"}
          />
          <StatTile bare label="Новых сделок" value={String(num(t.created))} delta={change(num(t.created), num(p.created))} hint={`от повторных клиентов: ${num(t.repeat_created)}`} />
          <StatTile bare label="Успешных" value={String(num(t.won))} delta={change(num(t.won), num(p.won))} hint={`новые клиенты ${num(t.won) - num(t.repeat_won)}, повторные ${num(t.repeat_won)}`} />
          <StatTile bare label="Конверсия в продажу" value={pct(num(t.won), num(t.created))} hint={`средний цикл ${mins(t.cycle === null || t.cycle === undefined ? null : num(t.cycle))}`} />
          <StatTile bare label="Первый ответ людей, медиана" value={workMins(resp.total.median)} goodWhenUp={false} hint={`в норматив ${sla} мин — ${share(resp.total.inSla)}; ждут сейчас ${num(awaiting.rows[0]?.n)}`} />
        </StatRow>
        <p className="text-xs text-muted">
          Время ответа — в рабочих минутах. Бот ответил первым {resp.bot.first} раз{resp.bot.median !== null ? ` (медиана ${mins(resp.bot.median * 60)})` : ""}; бот и правила в медиану людей не входят.
        </p>
      </section>

      {/* Воронка и каналы — две ведомости разной формы: этапы с долей от всех сделок и каналы с долей выручки. */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="funnel-h" className="min-w-0 space-y-2">
          <SectionHead id="funnel-h" title={`Воронка${pipelines.length > 1 ? `: ${pipeline.name}` : ""}`} meta="Сколько сделок за период дошли до этапа, конверсия из предыдущего, время на этапе" />
          <div className="panel overflow-hidden" data-testid="funnel">
            <table className="table">
              <thead>
                <tr>
                  <th>Этап</th>
                  <th className="w-[38%] max-sm:w-28">Дошли</th>
                  <th className="num max-sm:hidden">Из предыдущего</th>
                  <th className="num max-md:hidden">Время на этапе</th>
                </tr>
              </thead>
              <tbody>
                {funnel.map(({ st, n, prevN, time }) => (
                  <tr key={st.id}>
                    <td>
                      <div className="font-medium">{st.name}</div>
                      <div className="text-xs text-muted sm:hidden">
                        {prevN !== null ? `${pct(n, prevN)} из пред.` : null}
                        {time && st.kind === "open" ? `${prevN !== null ? ", " : ""}${mins(time.avg_sec)} на этапе` : null}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="w-8 shrink-0 text-right font-medium">{n}</span>
                        <ShareBar value={n} max={base} tone={st.kind === "won" ? "success" : "wine"} className="h-1.5 flex-1" />
                      </div>
                    </td>
                    <td className="num text-muted max-sm:hidden">{prevN !== null ? `${pct(n, prevN)} из пред.` : "—"}</td>
                    <td className="num text-muted max-md:hidden">{time && st.kind === "open" ? `${mins(time.avg_sec)} на этапе` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-muted sm:px-5">
              <span>Отказ: {num(t.lost)}</span>
              <span className="tabular-nums">сейчас в работе {inWork}</span>
            </div>
          </div>
        </section>

        <section aria-labelledby="channels-h" className="min-w-0 space-y-2">
          <SectionHead
            id="channels-h"
            title="Каналы"
            meta="Откуда приходят сделки и что продают"
            actions={
              <Link href="/admin/marketing" className="text-wine hover:underline">
                Ссылки и кампании
              </Link>
            }
          />
          <div className="panel overflow-hidden">
            {channelRows.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Канал</th>
                    <th className="num max-sm:hidden">Сделок</th>
                    <th className="num max-sm:hidden">Продаж</th>
                    <th className="num">Выручка</th>
                  </tr>
                </thead>
                <tbody>
                  {channelRows.map((r) => (
                    <tr key={r.key}>
                      <td>
                        <div className="font-medium">{r.label}</div>
                        <div className="text-xs text-muted">
                          конверсия {pct(r.won, r.created)}
                          <span className="sm:hidden">
                            , сделок {r.created}, продаж {r.won}
                          </span>
                        </div>
                      </td>
                      <td className="num max-sm:hidden">{r.created}</td>
                      <td className="num max-sm:hidden">{r.won}</td>
                      <td className="num">
                        <BarCell value={r.revenue} max={maxRevenue}>
                          {formatPrice(r.revenue)}
                        </BarCell>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState compact icon={Link2} title="Сделок за период нет" action={<Link href="/admin/marketing" className="btn btn-outline btn-sm">Создать ссылку с UTM-метками</Link>}>
                Каналы появятся, когда придут заявки из чатов, звонков или по ссылкам.
              </EmptyState>
            )}
          </div>
        </section>
      </div>

      <section aria-labelledby="team-h" className="space-y-2">
        <SectionHead id="team-h" title="Менеджеры" meta="Ответы с телефона магазина засчитываются тому, у кого был телефон («Телефон WhatsApp у …» в «Чатах»), — приблизительно" />
        <div className="panel overflow-hidden">
          {team.length ? (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="table min-w-[960px] [&_tr>*:first-child]:sticky [&_tr>*:first-child]:left-0 [&_tr>*:first-child]:z-[1] [&_tr>*:first-child]:bg-white" data-testid="leaderboard">
                  <thead>
                    <tr>
                      <th>Сотрудник</th>
                      <th className="num">Новых сделок</th>
                      <th className="num">Продаж</th>
                      <th className="num">Выручка</th>
                      <th className="num">Получено</th>
                      <th className="num">В работе</th>
                      <th className="num" title="Из CRM / с телефона магазина">
                        Сообщений CRM / тел.
                      </th>
                      <th className="num">Первый ответ</th>
                      <th className="num">Разговоров</th>
                      <th className="num">На линии</th>
                      <th className="num" title="Сделано / просрочено">
                        Задачи
                      </th>
                      <th className="num">План</th>
                    </tr>
                  </thead>
                  <tbody className="[&_td]:whitespace-nowrap">
                    {team.map((r) => (
                      <tr key={String(r.id)}>
                        <td className="font-medium">{r.name}</td>
                        <td className="num">{num(r.deals)}</td>
                        <td className="num">{num(r.won)}</td>
                        <td className="num">
                          <BarCell value={num(r.revenue)} max={maxTeamRevenue}>
                            {formatPrice(num(r.revenue))}
                          </BarCell>
                        </td>
                        <td className="num" title={num(r.received_agreed) ? `в т.ч. ${formatPrice(num(r.received_agreed))} — успешные сделки без платежа в журнале` : undefined}>
                          {formatPrice(num(r.received))}
                          {num(r.received_agreed) ? <div className="text-[11px] text-warning">без платежа {formatPrice(num(r.received_agreed))}</div> : null}
                        </td>
                        <td className="num">{num(r.open)}</td>
                        <td className="num">
                          {num(r.messages)} / {num(r.phone_messages)}
                        </td>
                        <td className="num" title={r.resp ? `ответов ${r.resp.answered}, в норматив ${share(r.resp.inSla)}` : undefined}>
                          {r.resp ? (
                            <>
                              {workMins(r.resp.median)} <span className="text-muted">{share(r.resp.inSla)}</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="num">{num(r.calls)}</td>
                        <td className="num">{Math.round(num(r.talk) / 60)} мин</td>
                        <td className="num">
                          {num(r.tasks_done)} / <span className={num(r.tasks_overdue) ? "font-medium text-danger" : undefined}>{num(r.tasks_overdue)}</span>
                        </td>
                        <td className="num">{planPct(String(r.id))}</td>
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
                    <ShareBar value={num(r.revenue)} max={maxTeamRevenue} />
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
        </div>
      </section>

      {/* Внизу — ожидание ответа слева, телефония и причины отказов справа: разная форма, разная ширина. */}
      <div className={cn("grid grid-cols-1 items-start gap-6", resp.longest.length ? "xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : "lg:grid-cols-2")}>
        {resp.longest.length ? (
          <section aria-labelledby="waits-h" className="min-w-0 space-y-2">
            <SectionHead id="waits-h" title="Дольше всего ждали ответа" meta="Рабочих минут до первого ответа человека; бот и правила не в счёт" />
            <ul className="panel divide-y divide-line overflow-hidden text-sm" data-testid="longest-waits">
              {resp.longest.map((w) => (
                <li key={`${w.conversationId}:${w.asked.toISOString()}`}>
                  <Link href={`/admin/chats?c=${w.conversationId}`} className="flex min-h-11 items-center gap-3 px-4 py-2 hover:bg-sunken/60 sm:px-5">
                    <span className="w-36 shrink-0 text-xs text-muted sm:w-44">{formatDate(w.asked, true)}</span>
                    <span className="min-w-0 flex-1 font-medium tabular-nums">{waitLabel(w.minutes, shift)}</span>
                    {w.answered ? null : <Badge tone="danger">без ответа</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="min-w-0 space-y-6">
          <section aria-labelledby="calls-h" className="space-y-2">
            <SectionHead id="calls-h" title="Телефония и ответы" actions={<Link href="/admin/calls" className="text-wine hover:underline">Журнал звонков</Link>} />
            <div className="panel px-4 py-3 sm:px-5">
              <Facts
                items={[
                  { label: "Входящих", value: <span className="tabular-nums">{num(c.incoming)}</span> },
                  { label: "Исходящих", value: <span className="tabular-nums">{num(c.outgoing)}</span> },
                  {
                    label: "Пропущено",
                    value: (
                      <span className={cn("tabular-nums", num(c.missed) > 0 && "font-medium text-danger")}>
                        {num(c.missed)} <span className="text-muted">{pct(num(c.missed), num(c.incoming))}</span>
                      </span>
                    ),
                  },
                  { label: "Перезвонили", value: <span className="tabular-nums">{pct(num(c.handled), num(c.missed))} <span className="text-muted">из пропущенных</span></span> },
                  { label: "Минут на линии", value: <span className="tabular-nums">{Math.round(num(c.talk) / 60)}</span> },
                  {
                    label: "Вопросы без ответа",
                    value: (
                      <span className={cn("tabular-nums", resp.total.unanswered > 0 && "font-medium text-danger")}>
                        {resp.total.unanswered} <span className="text-muted">из {resp.total.asked}</span>
                      </span>
                    ),
                  },
                ]}
              />
            </div>
          </section>

          <section aria-labelledby="lost-h" className="space-y-2">
            <SectionHead id="lost-h" title="Причины отказов" />
            <div className="panel px-4 py-4 sm:px-5">
              {lost.rows.length ? (
                <BarList rows={lost.rows.map((r) => ({ label: String(r.reason), value: num(r.n) }))} />
              ) : (
                <EmptyState compact icon={CircleCheck} title="Отказов за период нет">
                  Причину выбирают, когда переводят сделку в «Отказ».
                </EmptyState>
              )}
            </div>
          </section>
        </div>
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
