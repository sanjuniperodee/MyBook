import { localDay } from "@/modules/reporting/ui/time";
import { storeTimeZone, zonedDay } from "@/shared/domain/time";
import { z } from "zod";
import { MoneyFlow } from "@/components/admin/MoneyFlow";
import { PeriodBar, periodQuery } from "@/components/admin/PeriodBar";
import { financePeriod } from "@/modules/reporting/ui/finance-screen";
import { planName } from "@/i18n/labels";
import Link from "next/link";
import { CalendarClock, CircleCheck, History, Link2, type LucideIcon } from "lucide-react";
import { formatPrice, getPlans } from "@/config/site";
import { orderStatusLabel } from "@/modules/ordering/ui/status";
import { can, requireStaff } from "@/server/access";
import { redirect } from "next/navigation";
import { layoutTabs, mobileLayout } from "@/shared/domain/mobileLayout";
import { MyDay, myDayParts } from "../MyDay";
import { BarList, RevenueColumns, StatRow, StatTile, type DayPoint } from "@/components/admin/charts";
import { PageHeader } from "@/components/admin/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/class-names";
import { formatDate, nowMs } from "@/lib/dates";
import type { AttentionRow } from "@/modules/reporting";
import { crmRead } from "@/server/v1-local-bridge-crm";

export const metadata = { title: "Обзор" };

/** Параметры адреса: период (как в «Финансах»); source=pwa — запуск приложения. */
const query = z.object({ p: z.string().max(10).optional(), from: z.string().max(10).optional(), to: z.string().max(10).optional() }).catch({});
const change = (cur: number, prev: number) => (prev ? (cur - prev) / prev : cur ? null : 0);

/** Куда ведёт первая вкладка нижней панели каждой роли — туда установленная CRM открывается при запуске с иконки (как главная вкладка приложения). */
const LAUNCH: Record<string, string> = {
  chats: "/admin/chats",
  tasks: "/admin/tasks",
  deals: "/admin/deals",
  clients: "/admin/clients",
  orders: "/admin/orders",
  calls: "/admin/calls",
};

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff();
  const launch = (await searchParams).source === "pwa";
  if (launch) {
    const first = layoutTabs(
      mobileLayout((p) => can(staff, p), staff.isOwner),
      (p) => can(staff, p),
    )[0];
    if (LAUNCH[first]) redirect(LAUNCH[first]);
  }
  const todayLabel = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: storeTimeZone(),
  }).format(new Date());
  // Без доступа к аналитике — только рабочий стол сотрудника, без выручки магазина.
  if (!can(staff, "analytics.view"))
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Мой день" meta={<span className="text-sm text-muted">{todayLabel}</span>} />
        <MyDay staff={staff} />
      </div>
    );
  // Период и деньги — как в «Финансах», «Прибыли» и «Аналитике продаж»: те же пресеты, свои даты и один расчёт денег.
  const q = query.parse(await searchParams);
  const tz = storeTimeZone();
  const period = financePeriod({ preset: q.p, from: q.from, to: q.to, now: new Date(), tz });
  const pq = periodQuery(period);
  const showFlow = staff.scope === "all" && can(staff, "finance.view");
  const { channelsReport, profit, dashboard, dealAttention } = await crmRead("shell.dashboard", { p: q.p, from: q.from, to: q.to });
  const flow = profit.screen.flow;
  const unit = profit.screen.unit;
  const sources = {
    rows: channelsReport.channels.filter((c) => c.registrations || c.leads || c.sales).slice(0, 8),
  };
  const { newUsers, funnelRows, byPlan, deadlines, dealDeadlines, attention, events } = dashboard;

  // Деньги по дням — те же поступления минус возвраты, что в «Финансах», по дню магазина.
  const byDay = new Map<string, { sum: number; n: number }>();
  for (const m of profit.data.money) {
    if (m.at < period.from || m.at >= period.to) continue;
    const d = zonedDay(m.at, tz);
    const cur = byDay.get(d) ?? { sum: 0, n: 0 };
    cur.sum += m.kind === "refund" ? -m.amount : m.amount;
    if (m.kind !== "refund") cur.n++;
    byDay.set(d, cur);
  }
  const series: DayPoint[] = period.days.map((d) => ({ date: d, value: byDay.get(d)?.sum ?? 0, count: byDay.get(d)?.n ?? 0 }));
  const f = funnelRows.rows[0] ?? {
    registered: 0,
    with_book: 0,
    engaged: 0,
    ordered: 0,
    paid: 0,
  };
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  const deadlineRows = [
    ...deadlines.map((o) => ({
      key: `o${o.id}`,
      href: `/admin/orders/${o.id}`,
      label: `№${o.number}`,
      name: o.contactName,
      note: null as string | null,
      due: o.desiredDate as string,
    })),
    // Сроки ручных сделок: «Д» + номер сделки; с пометкой, сколько уже получено.
    ...dealDeadlines.map((d) => ({
      key: `d${d.id}`,
      href: `/admin/deals/${d.id}`,
      label: `Д${d.number}`,
      name: d.contact_name || d.title,
      note: d.paid ? `получено ${formatPrice(d.paid)}` : null,
      due: d.due,
    })),
  ]
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 8);
  const manual = byPlan.find((b) => b.plan === "manual");

  const day = await myDayParts(staff);
  const days = (due: string) => Math.round((new Date(`${due}T00:00:00`).getTime() - localDay(0).getTime()) / 86_400_000);
  const stat = "flex flex-col justify-between gap-1 px-4 py-3.5 sm:px-5";
  const delta = (cur: number, prev: number) => {
    const d = change(cur, prev);
    if (d === null || !Number.isFinite(d)) return null;
    return (
      <span className={cn("text-xs font-semibold tabular-nums", d === 0 ? "text-muted" : d > 0 ? "text-success" : "text-danger")}>
        {d > 0 ? "+" : d < 0 ? "−" : ""}
        {Math.abs(Math.round(d * 100))}%
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Обзор"
        meta={<span className="text-sm text-muted">{todayLabel}</span>}
      />
      <PeriodBar path="/admin" period={period} bad={q.p === "custom" && period.preset !== "custom"} />
      {showFlow ? <MoneyFlow flow={flow} taxRate={profit.taxRate} query={pq} /> : null}
      <div className="flex flex-col gap-5" data-testid="my-day">
        {day.strip}
        {day.plan}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        {/* Правая колонка — «что делать»: на телефоне она идёт первой, на ноутбуке — справа от работы и аналитики. */}
        <aside aria-label="Требует действия" className="flex min-w-0 flex-col gap-5 xl:order-2">
          {day.queue}
          {day.lists}
          <ListPanel
            title="Требуют внимания"
            href="/admin/board"
            linkLabel="Все"
            empty={{
              icon: CircleCheck,
              title: "Всё обработано",
              text: "Счета, передачи от бота и оплаты, которые нужно проверить, появятся здесь.",
            }}
          >
            {[
              ...dealAttention.map((a) => <AttentionLine key={`${a.kind}:${a.dealId}:${a.conversationId ?? ""}`} row={a} />),
              ...attention.map((o) => (
                <Link key={o.id} href={`/admin/orders/${o.id}`} className="flex min-h-12 items-center gap-3 px-4 py-2.5 text-sm hover:bg-sunken/60 sm:px-5">
                  <span className="w-11 shrink-0 font-semibold tabular-nums">№{o.number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.contactName}</span>
                    <span className="block text-xs text-muted">{planName(o.plan)}</span>
                  </span>
                  <span className={cn("badge shrink-0", o.status === "paid" ? "badge-info" : "badge-warning")}>{o.status === "paid" ? "в печать" : "проверить оплату"}</span>
                </Link>
              )),
            ]}
          </ListPanel>
          <ListPanel
            title="Сроки клиентов"
            href="/admin/board"
            linkLabel="Канбан"
            empty={{
              icon: CalendarClock,
              title: "Ближайших сроков нет",
              text: "Здесь появятся заказы и сделки с датой события в ближайшие две недели.",
            }}
          >
            {deadlineRows.map((o) => {
              const d = days(o.due);
              return (
                <Link key={o.key} href={o.href} className="flex min-h-12 items-center gap-3 px-4 py-2.5 text-sm hover:bg-sunken/60 sm:px-5">
                  <span className="w-11 shrink-0 font-semibold tabular-nums">{o.label}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.name}</span>
                    {o.note ? <span className="block text-xs text-muted">{o.note}</span> : null}
                  </span>
                  <span className={cn("badge shrink-0", d < 0 ? "badge-danger" : d <= 3 ? "badge-warning" : "")}>{d < 0 ? `просрочен ${-d} дн.` : d === 0 ? "сегодня" : `через ${d} дн.`}</span>
                </Link>
              );
            })}
          </ListPanel>
        </aside>

        <div className="flex min-w-0 flex-col gap-5 xl:order-1">
          {day.tasks}

          <section aria-labelledby="sales-h" className="panel overflow-hidden">
            <div className="panel-head">
              <h2 id="sales-h" className="panel-title">
                Деньги и продажи: {period.label.toLowerCase()}
              </h2>
              <span className="text-xs text-muted">к прошлому периоду</span>
            </div>
            <div className="grid grid-cols-2 gap-px border-b border-line bg-line xl:grid-cols-4">
              {[
                {
                  label: "Пришло денег",
                  value: formatPrice(flow.revenue),
                  d: delta(flow.revenue, flow.prevRevenue),
                  hint: "за вычетом возвратов, как в «Финансах»" as string | null,
                },
                {
                  label: "Новых покупателей",
                  value: unit.buyers.toLocaleString("ru-RU"),
                  d: delta(unit.buyers, profit.screen.prevUnit.buyers),
                  hint: "первая оплата в периоде",
                },
                {
                  label: "Средний договор",
                  value: unit.avgAgreed === null ? "—" : formatPrice(unit.avgAgreed),
                  d: null,
                  hint: "у новых покупателей",
                },
                {
                  label: "Новые клиенты",
                  value: newUsers.cur.toLocaleString("ru-RU"),
                  d: delta(newUsers.cur, newUsers.prev),
                  hint: null,
                },
              ].map((x) => (
                <div key={x.label} className={cn(stat, "bg-white")}>
                  <span className="text-[13px] text-muted">{x.label}</span>
                  <span className="flex items-baseline gap-2">
                    <span className="text-2xl leading-tight font-semibold tracking-[-0.02em] tabular-nums">{x.value}</span>
                    {x.d}
                  </span>
                  {x.hint ? <span className="text-xs text-muted">{x.hint}</span> : null}
                </div>
              ))}
            </div>
            <div className="p-4 sm:p-5">
              <p className="mb-5 text-xs text-muted">Деньги по дням: поступления минус возвраты по дню магазина ({tz}) — как в «Финансах»</p>
              <RevenueColumns data={series} />
            </div>
          </section>

          <Panel
            flush
            title="Откуда приходят клиенты"
            actions={
              <Link href={`/admin/marketing?period=${period.days.length}`} className="btn btn-ghost btn-sm">
                Все каналы
              </Link>
            }
          >
            {sources.rows.length ? (
              <>
                <ul className="divide-y divide-line sm:hidden">
                  {sources.rows.map((r) => (
                    <li key={r.key} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{r.label}</span>
                        <span className="block text-xs text-muted">
                          регистраций {r.registrations}, заявок {r.leads}, продаж {r.sales}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">{formatPrice(r.revenue)}</span>
                    </li>
                  ))}
                </ul>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="table min-w-[560px]">
                    <thead>
                      <tr>
                        <th>Канал</th>
                        <th className="num">Регистрации</th>
                        <th className="num">Заявки</th>
                        <th className="num">Продажи</th>
                        <th className="num">Конверсия</th>
                        <th className="num" title="Оплаченные заказы клиентов канала и деньги по его сделкам">
                          Продано на
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sources.rows.map((r) => (
                        <tr key={r.key}>
                          <td className="font-medium">{r.label}</td>
                          <td className="num">{r.registrations}</td>
                          <td className="num">{r.leads}</td>
                          <td className="num">{r.sales}</td>
                          <td className="num text-muted">{pct(r.sales, r.registrations + r.leadsWithoutClient)}</td>
                          <td className="num font-semibold">{formatPrice(r.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <EmptyState
                compact
                icon={Link2}
                title="Клиентов за период пока нет"
                action={
                  <Link href="/admin/marketing" className="btn btn-outline btn-sm">
                    Создать ссылку с UTM-метками
                  </Link>
                }
              >
                Ссылки с метками покажут, какой канал приводит клиентов и выручку.
              </EmptyState>
            )}
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Воронка" description={`Клиенты, зарегистрированные за период: ${period.label.toLowerCase()}`}>
              <BarList
                rows={[
                  { label: "Зарегистрировались", value: f.registered },
                  {
                    label: "Создали книгу",
                    value: f.with_book,
                    note: pct(f.with_book, f.registered),
                  },
                  {
                    label: "Начали писать текст",
                    value: f.engaged,
                    note: pct(f.engaged, f.registered),
                  },
                  {
                    label: "Оформили заказ",
                    value: f.ordered,
                    note: pct(f.ordered, f.registered),
                  },
                  {
                    label: "Оплатили",
                    value: f.paid,
                    note: pct(f.paid, f.registered),
                  },
                ]}
              />
            </Panel>
            <Panel title="Продажи по тарифам" description="Суммы оплаченных заказов по дате оплаты и продажи менеджеров — это продажи, а не поступления денег">
              <BarList
                format={formatPrice}
                rows={[
                  ...getPlans().map((p) => {
                    const r = byPlan.find((b) => b.plan === p.id);
                    return {
                      label: planName(p.id),
                      value: r?.sum ?? 0,
                      note: r ? `${r.n} шт.` : undefined,
                    };
                  }),
                  // Деньги по ручным сделкам (предоплаты, доплаты, продажи в чате) — отдельной строкой, чтобы сумма сходилась с «Выручкой».
                  ...(manual
                    ? [
                        {
                          label: "Продажи менеджеров",
                          value: manual.sum,
                          note: `${manual.n} шт.`,
                        },
                      ]
                    : []),
                ]}
              />
            </Panel>
          </div>

          <Panel
            flush
            title="Последние события"
            actions={
              <Link href="/admin/orders" className="btn btn-ghost btn-sm">
                Заказы
              </Link>
            }
          >
            {events.length ? (
              <ol className="px-4 py-2 sm:px-5">
                {events.map(({ e, number, orderId }) => (
                  <li key={e.id} className="group relative">
                    <Link href={`/admin/orders/${orderId}`} className="relative flex gap-3 py-2 pl-5 text-sm">
                      <span className="absolute top-0 bottom-0 left-[3px] w-px bg-line group-first:top-4 group-last:bottom-4" aria-hidden />
                      <span className="absolute top-[1.05rem] left-0 size-[7px] rounded-full bg-line-strong ring-2 ring-white group-hover:bg-wine" aria-hidden />
                      <span className="w-11 shrink-0 font-semibold tabular-nums">№{number}</span>
                      <span className="min-w-0 flex-1 text-ink-soft group-hover:text-ink">
                        {e.status ? <span className="font-medium text-ink">{orderStatusLabel(e.status)}. </span> : null}
                        {e.note}
                      </span>
                      <span className="shrink-0 text-xs text-muted">{formatDate(e.createdAt, true).replace(/ \d{4} г\./, "")}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState compact icon={History} title="Событий пока нет">
                Смена статусов заказов будет видна здесь.
              </EmptyState>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

/** Строка «Требуют внимания» по сделке (bots-11): что случилось и куда идти. */
function AttentionLine({ row: a }: { row: AttentionRow }) {
  const now = nowMs();
  const mins = Math.max(0, Math.round((now - new Date(a.at).getTime()) / 60_000));
  const days = a.kind === "deadline_unpaid" ? Math.round((new Date(`${a.at}T00:00:00`).getTime() - localDay(0).getTime()) / 86_400_000) : 0;
  const label =
    a.kind === "handoff"
      ? `бот передал — ждёт ответа ${mins < 120 ? `${mins} мин` : `${Math.round(mins / 60)} ч`}`
      : a.kind === "invoice_expiring"
        ? `счёт ${a.amount ? formatPrice(a.amount) : ""} истекает ${formatDate(a.at, true).replace(/ \d{4} г\./, "")}`
        : a.kind === "invoice_expired"
          ? "счёт истёк — выставьте новый"
          : days === 0
            ? "событие сегодня — не оплачено"
            : `до события ${days} дн. — не оплачено`;
  const href = a.kind === "handoff" && a.conversationId ? `/admin/chats?c=${a.conversationId}` : `/admin/deals/${a.dealId}`;
  return (
    <Link href={href} className="flex min-h-12 items-center gap-3 px-4 py-2.5 text-sm hover:bg-sunken/60 sm:px-5" data-testid={`attention-${a.kind}`}>
      <span className="w-11 shrink-0 font-semibold tabular-nums">Д{a.number}</span>
      <span className="min-w-0 flex-1 truncate">{a.contact || "без имени"}</span>
      <span className={cn("badge max-w-[55%] shrink-0", a.kind === "handoff" || a.kind === "invoice_expired" ? "badge-danger" : "badge-warning")}>
        <span className="truncate">{label}</span>
      </span>
    </Link>
  );
}

/** Лист-список со ссылкой на раздел и пустым состоянием, которое объясняет, что здесь появится. */
function ListPanel({
  title,
  href,
  linkLabel,
  empty,
  children,
}: {
  title: string;
  href: string;
  linkLabel: string;
  empty: { icon: LucideIcon; title: string; text: string };
  children: React.ReactNode[];
}) {
  return (
    <Panel
      flush
      title={title}
      actions={
        <Link href={href} className="btn btn-ghost btn-sm">
          {linkLabel}
        </Link>
      }
    >
      {children.length ? (
        <div className="divide-y divide-line">{children}</div>
      ) : (
        <div className="flex items-start gap-3 px-4 py-3.5 text-sm sm:px-5">
          <empty.icon className="mt-0.5 size-4 shrink-0 text-muted" strokeWidth={1.8} aria-hidden />
          <p className="text-muted">
            <span className="font-medium text-ink-soft">{empty.title}.</span> {empty.text}
          </p>
        </div>
      )}
    </Panel>
  );
}
