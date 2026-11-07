import { container } from "@/server/container";
import { iso, localDay } from "@/modules/reporting/time";
import { storeTimeZone } from "@/shared/domain/time";
import { planName } from "@/i18n/labels";
import Link from "next/link";
import { CalendarClock, CircleCheck, History, Link2, type LucideIcon } from "lucide-react";
import { formatPrice, getPlans } from "@/config/site";
import { orderStatusLabel } from "@/modules/ordering/ui/status";
import { can, requireStaff, staffViewer } from "@/server/access";
import { redirect } from "next/navigation";
import { layoutTabs, mobileLayout } from "@/shared/domain/mobileLayout";
import { MyDay } from "../MyDay";
import { BarList, RevenueColumns, StatRow, StatTile, type DayPoint } from "@/components/admin/charts";
import { PageHeader } from "@/components/admin/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/class-names";
import { Segmented } from "@/components/admin/Segmented";
import { formatDate, nowMs } from "@/lib/dates";
import { getSetting } from "@/modules/workspace";
import type { AttentionRow } from "@/modules/reporting";

export const metadata = { title: "Обзор" };

const periods = [7, 30, 90] as const;
const change = (cur: number, prev: number) => (prev ? (cur - prev) / prev : cur ? null : 0);

/** Куда ведёт первая вкладка нижней панели каждой роли — туда установленная CRM открывается при запуске с иконки (как главная вкладка приложения). */
const LAUNCH: Record<string, string> = { chats: "/admin/chats", tasks: "/admin/tasks", deals: "/admin/deals", clients: "/admin/clients", orders: "/admin/orders", calls: "/admin/calls" };

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ period?: string; source?: string }> }) {
  const staff = await requireStaff();
  const launch = (await searchParams).source === "pwa";
  if (launch) {
    const first = layoutTabs(mobileLayout((p) => can(staff, p), staff.isOwner), (p) => can(staff, p))[0];
    if (LAUNCH[first]) redirect(LAUNCH[first]);
  }
  // Без доступа к аналитике — только рабочий стол сотрудника, без выручки магазина.
  if (!can(staff, "analytics.view"))
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Мой день</h1>
        <MyDay staff={staff} />
      </div>
    );
  const { period: raw } = await searchParams;
  const period = periods.find((p) => String(p) === raw) ?? 30;
  const channelsReport = await container().marketing.service.report(period);
  const sources = { rows: channelsReport.channels.filter((c) => c.registrations || c.leads || c.sales).slice(0, 8) };
  const [{ daily, cur, prev, newUsers, funnelRows, byPlan, deadlines, dealDeadlines, attention, events }, dealAttention] = await Promise.all([
    container().reporting.dashboard(period, staffViewer(staff)),
    getSetting("crm.slaMinutes").then((sla) => container().reporting.attention(staffViewer(staff), Number(sla) || 15)),
  ]);

  const byDay = new Map(daily.map((r) => [r.d, r]));
  const series: DayPoint[] = Array.from({ length: period }, (_, i) => {
    const d = iso(localDay(-(period - 1) + i));
    const r = byDay.get(d);
    return { date: d, value: r?.sum ?? 0, count: r?.n ?? 0 };
  });
  const f = funnelRows.rows[0] ?? { registered: 0, with_book: 0, engaged: 0, ordered: 0, paid: 0 };
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  const avg = cur.n ? Math.round(cur.sum / cur.n) : 0;
  const prevAvg = prev.n ? Math.round(prev.sum / prev.n) : 0;

  const deadlineRows = [
    ...deadlines.map((o) => ({ key: `o${o.id}`, href: `/admin/orders/${o.id}`, label: `№${o.number}`, name: o.contactName, note: null as string | null, due: o.desiredDate as string })),
    // Сроки ручных сделок: «Д» + номер сделки; с пометкой, сколько уже получено.
    ...dealDeadlines.map((d) => ({ key: `d${d.id}`, href: `/admin/deals/${d.id}`, label: `Д${d.number}`, name: d.contact_name || d.title, note: d.paid ? `получено ${formatPrice(d.paid)}` : null, due: d.due })),
  ]
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 8);
  const manual = byPlan.find((b) => b.plan === "manual");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Обзор" actions={<Segmented label="Период" items={periods.map((p) => ({ key: String(p), label: `${p} дней`, href: `/admin?period=${p}`, active: p === period }))} />} />
      <MyDay staff={staff} />

      <section aria-labelledby="sales-h" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="sales-h" className="text-lg font-semibold">
            Продажи за {period} дней
          </h2>
          <span className="text-xs text-muted">к прошлым {period} дням</span>
        </div>
        <StatRow>
          <StatTile bare label="Выручка" value={formatPrice(cur.sum)} delta={change(cur.sum, prev.sum)} hint={cur.agreed ? `в т.ч. ${formatPrice(cur.agreed)} по сделкам без платежа` : undefined} />
          <StatTile bare label="Оплаченные продажи" value={cur.n.toLocaleString("ru-RU")} delta={change(cur.n, prev.n)} />
          <StatTile bare label="Средний чек" value={formatPrice(avg)} delta={change(avg, prevAvg)} />
          <StatTile bare label="Новые клиенты" value={newUsers.cur.toLocaleString("ru-RU")} delta={change(newUsers.cur, newUsers.prev)} />
        </StatRow>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="Выручка по дням" description={`По дате оплаты (${storeTimeZone()}): заказы и платежи менеджеров`}>
          <RevenueColumns data={series} />
        </Panel>
        <Panel title="Воронка" description={`Клиенты, зарегистрированные за ${period} дней`}>
          <BarList
            rows={[
              { label: "Зарегистрировались", value: f.registered },
              { label: "Создали книгу", value: f.with_book, note: pct(f.with_book, f.registered) },
              { label: "Начали писать текст", value: f.engaged, note: pct(f.engaged, f.registered) },
              { label: "Оформили заказ", value: f.ordered, note: pct(f.ordered, f.registered) },
              { label: "Оплатили", value: f.paid, note: pct(f.paid, f.registered) },
            ]}
          />
        </Panel>
      </div>

      <Panel
        flush
        title="Откуда приходят клиенты"
        actions={
          <Link href={`/admin/marketing?period=${period}`} className="btn btn-ghost btn-sm">
            Все каналы и кампании
          </Link>
        }
      >
        {sources.rows.length ? (
          <div className="overflow-x-auto">
            <table className="table min-w-[560px] [&_td:first-child]:pl-4 [&_th:first-child]:pl-4 sm:[&_td:first-child]:pl-5 sm:[&_th:first-child]:pl-5 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4 sm:[&_td:last-child]:pr-5 sm:[&_th:last-child]:pr-5">
              <thead>
                <tr>
                  <th>Канал</th>
                  <th className="text-right">Регистрации</th>
                  <th className="text-right">Заявки</th>
                  <th className="text-right">Продажи</th>
                  <th className="text-right">Конверсия</th>
                  <th className="text-right">Выручка</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {sources.rows.map((r) => (
                  <tr key={r.key}>
                    <td className="font-medium">{r.label}</td>
                    <td className="text-right">{r.registrations}</td>
                    <td className="text-right">{r.leads}</td>
                    <td className="text-right">{r.sales}</td>
                    <td className="text-right text-muted">{pct(r.sales, r.registrations + r.leadsWithoutClient)}</td>
                    <td className="text-right font-medium">{formatPrice(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState compact icon={Link2} title="Клиентов за период пока нет" action={<Link href="/admin/marketing" className="btn btn-outline btn-sm">Создать ссылку с UTM-метками</Link>}>
            Ссылки с метками покажут, какой канал приводит клиентов и выручку.
          </EmptyState>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Выручка по тарифам">
          <BarList
            format={formatPrice}
            rows={[
              ...getPlans().map((p) => {
                const r = byPlan.find((b) => b.plan === p.id);
                return { label: planName(p.id), value: r?.sum ?? 0, note: r ? `${r.n} шт.` : undefined };
              }),
              // Деньги по ручным сделкам (предоплаты, доплаты, продажи в чате) — отдельной строкой, чтобы сумма сходилась с «Выручкой».
              ...(manual ? [{ label: "Продажи менеджеров", value: manual.sum, note: `${manual.n} шт.` }] : []),
            ]}
          />
        </Panel>

        <ListPanel title="Сроки клиентов" href="/admin/board" linkLabel="Канбан заказов" empty={{ icon: CalendarClock, title: "Ближайших сроков нет", text: "Здесь появятся заказы и сделки с датой события в ближайшие две недели." }}>
          {deadlineRows.map((o) => {
            const days = Math.round((new Date(`${o.due}T00:00:00`).getTime() - localDay(0).getTime()) / 86_400_000);
            return (
              <Link key={o.key} href={o.href} className="flex min-h-12 items-center gap-3 px-4 py-2.5 text-sm hover:bg-sunken/60 sm:px-5">
                <span className="w-11 shrink-0 font-medium tabular-nums">{o.label}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.name}</span>
                  {o.note ? <span className="block text-xs text-muted">{o.note}</span> : null}
                </span>
                <span className={cn("badge", days < 0 ? "badge-danger" : days <= 3 ? "badge-warning" : "")}>{days < 0 ? `просрочен ${-days} дн.` : days === 0 ? "сегодня" : `через ${days} дн.`}</span>
              </Link>
            );
          })}
        </ListPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListPanel title="Требуют внимания" href="/admin/board" linkLabel="Все" empty={{ icon: CircleCheck, title: "Всё обработано", text: "Счета, передачи от бота и оплаты, которые нужно проверить, появятся здесь." }}>
          {[
            ...dealAttention.map((a) => <AttentionLine key={`${a.kind}:${a.dealId}:${a.conversationId ?? ""}`} row={a} />),
            ...attention.map((o) => (
              <Link key={o.id} href={`/admin/orders/${o.id}`} className="flex min-h-12 items-center gap-3 px-4 py-2.5 text-sm hover:bg-sunken/60 sm:px-5">
                <span className="w-11 shrink-0 font-medium tabular-nums">№{o.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.contactName}</span>
                  <span className="block text-xs text-muted">{planName(o.plan)}</span>
                </span>
                <span className={cn("badge", o.status === "paid" ? "badge-info" : "badge-warning")}>{o.status === "paid" ? "передать в печать" : "проверить оплату"}</span>
              </Link>
            )),
          ]}
        </ListPanel>
        <ListPanel title="Последние события" href="/admin/orders" linkLabel="Заказы" empty={{ icon: History, title: "Событий пока нет", text: "Смена статусов заказов будет видна здесь." }}>
          {events.map(({ e, number, orderId }) => (
            <Link key={e.id} href={`/admin/orders/${orderId}`} className="flex min-h-12 items-center gap-3 px-4 py-2.5 text-sm hover:bg-sunken/60 sm:px-5">
              <span className="w-11 shrink-0 font-medium tabular-nums">№{number}</span>
              <span className="min-w-0 flex-1 truncate text-ink-soft">
                {e.status ? <span className="font-medium text-ink">{orderStatusLabel(e.status)}. </span> : null}
                {e.note}
              </span>
              <span className="shrink-0 text-xs text-muted">{formatDate(e.createdAt, true).replace(/ \d{4} г\./, "")}</span>
            </Link>
          ))}
        </ListPanel>
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
      <span className="w-11 shrink-0 font-medium tabular-nums">Д{a.number}</span>
      <span className="min-w-0 flex-1 truncate">{a.contact || "без имени"}</span>
      <span className={cn("badge max-w-[55%] truncate", a.kind === "handoff" || a.kind === "invoice_expired" ? "badge-danger" : "badge-warning")}>{label}</span>
    </Link>
  );
}

/** Лист-список со ссылкой на раздел и пустым состоянием, которое объясняет, что здесь появится. */
function ListPanel({ title, href, linkLabel, empty, children }: { title: string; href: string; linkLabel: string; empty: { icon: LucideIcon; title: string; text: string }; children: React.ReactNode[] }) {
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
        <EmptyState compact icon={empty.icon} title={empty.title}>
          {empty.text}
        </EmptyState>
      )}
    </Panel>
  );
}
