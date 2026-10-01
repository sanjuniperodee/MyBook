import { planName } from "@/i18n/labels";
import Link from "next/link";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import { AlertCircle, ArrowRight, CalendarClock, CheckSquare } from "lucide-react";
import { db } from "@/lib/db";
import { crmTasks, orderEvents, orders, users } from "@/lib/db/schema";
import { formatPrice, plans } from "@/config/site";
import { orderStatusColors, orderStatusLabel } from "@/modules/ordering/ui/status";
import { can, requireStaff } from "@/lib/crm/rbac";
import { MyDay } from "./MyDay";
import { channelReport } from "@/lib/crm/marketing";
import { BarList, RevenueColumns, StatTile, type DayPoint } from "@/components/admin/charts";
import { cn, formatDate } from "@/lib/utils";

export const metadata = { title: "Обзор" };

const TZ = "Asia/Almaty";
const periods = [7, 30, 90] as const;
// Константа, не пользовательский ввод — можно вставлять в SQL как литерал (нужно для GROUP BY).
const tzSql = sql.raw(`'${TZ}'`);

function localDay(offsetDays: number) {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const change = (cur: number, prev: number) => (prev ? (cur - prev) / prev : cur ? null : 0);

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const staff = await requireStaff();
  const admin = staff.user;
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
  // Границы периода в часовом поясе магазина
  const startLocal = localDay(-(period - 1));
  const prevStartLocal = localDay(-(2 * period - 1));
  const start = sql`(${iso(startLocal)}::date at time zone ${tzSql})`;
  const prevStart = sql`(${iso(prevStartLocal)}::date at time zone ${tzSql})`;
  const paidDay = sql<string>`to_char((${orders.paidAt} at time zone ${tzSql})::date, 'YYYY-MM-DD')`;
  const notCancelled = ne(orders.status, "cancelled");

  const channelsReport = await channelReport(period);
  const sources = { rows: channelsReport.channels.filter((c) => c.registrations || c.leads || c.sales).slice(0, 8) };
  const [daily, [cur], [prev], [newUsers], funnelRows, byPlan, deadlines, tasks, attention, events] = await Promise.all([
    db
      .select({ d: paidDay, sum: sql<number>`sum(${orders.amount})::int`, n: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(isNotNull(orders.paidAt), sql`${orders.paidAt} >= ${start}`, notCancelled))
      .groupBy(paidDay),
    db
      .select({ sum: sql<number>`coalesce(sum(${orders.amount}),0)::int`, n: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(isNotNull(orders.paidAt), sql`${orders.paidAt} >= ${start}`, notCancelled)),
    db
      .select({ sum: sql<number>`coalesce(sum(${orders.amount}),0)::int`, n: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(isNotNull(orders.paidAt), sql`${orders.paidAt} >= ${prevStart}`, sql`${orders.paidAt} < ${start}`, notCancelled)),
    db
      .select({
        cur: sql<number>`count(*) filter (where ${users.createdAt} >= ${start})::int`,
        prev: sql<number>`count(*) filter (where ${users.createdAt} >= ${prevStart} and ${users.createdAt} < ${start})::int`,
      })
      .from(users),
    // Воронка по когорте зарегистрировавшихся в периоде
    db.execute<{ registered: number; with_book: number; engaged: number; ordered: number; paid: number }>(sql`
      select
        count(*)::int as registered,
        count(*) filter (where exists (select 1 from books b where b.user_id = u.id))::int as with_book,
        count(*) filter (where exists (
          select 1 from books b where b.user_id = u.id
          and (select count(*) from book_questions q where q.book_id = b.id and length(trim(q.answer)) > 0) >= 10))::int as engaged,
        count(*) filter (where exists (select 1 from orders o where o.user_id = u.id))::int as ordered,
        count(*) filter (where exists (select 1 from orders o where o.user_id = u.id and o.paid_at is not null and o.status <> 'cancelled'))::int as paid
      from users u where u.created_at >= ${start} and u.role = 'user'`),
    db
      .select({ plan: orders.plan, sum: sql<number>`sum(${orders.amount})::int`, n: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(isNotNull(orders.paidAt), sql`${orders.paidAt} >= ${start}`, notCancelled))
      .groupBy(orders.plan),
    db
      .select()
      .from(orders)
      .where(and(isNotNull(orders.desiredDate), lte(orders.desiredDate, iso(localDay(14))), inArray(orders.status, ["pending_payment", "paid", "in_production"])))
      .orderBy(asc(orders.desiredDate))
      .limit(8),
    db
      .select()
      .from(crmTasks)
      .where(and(isNull(crmTasks.doneAt), lte(crmTasks.dueAt, localDay(1)), or(isNull(crmTasks.assigneeId), eq(crmTasks.assigneeId, admin.id))))
      .orderBy(asc(crmTasks.dueAt))
      .limit(8),
    db
      .select()
      .from(orders)
      .where(or(eq(orders.status, "paid"), and(eq(orders.status, "pending_payment"), isNotNull(orders.paymentClaimedAt))))
      .orderBy(asc(orders.createdAt))
      .limit(10),
    db
      .select({ e: orderEvents, number: orders.number, orderId: orders.id })
      .from(orderEvents)
      .innerJoin(orders, eq(orderEvents.orderId, orders.id))
      .where(gte(orderEvents.createdAt, localDay(-14)))
      .orderBy(desc(orderEvents.createdAt))
      .limit(10),
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Обзор</h1>
        <div className="flex rounded-xl border border-line bg-white p-1 text-sm">
          {periods.map((p) => (
            <Link key={p} href={`/admin?period=${p}`} className={cn("rounded-lg px-3 py-1.5", p === period ? "bg-ink text-white" : "text-ink-soft hover:bg-cream")}>
              {p} дней
            </Link>
          ))}
        </div>
      </div>
      <MyDay staff={staff} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Выручка" value={formatPrice(cur.sum)} delta={change(cur.sum, prev.sum)} />
        <StatTile label="Оплаченные заказы" value={cur.n.toLocaleString("ru-RU")} delta={change(cur.n, prev.n)} />
        <StatTile label="Средний чек" value={formatPrice(avg)} delta={change(avg, prevAvg)} />
        <StatTile label="Новые клиенты" value={newUsers.cur.toLocaleString("ru-RU")} delta={change(newUsers.cur, newUsers.prev)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-line bg-white p-5">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="font-semibold">Выручка по дням</h2>
            <span className="text-xs text-muted">по дате оплаты, {TZ}</span>
          </div>
          <RevenueColumns data={series} />
        </section>
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="font-semibold">Воронка</h2>
          <p className="mb-5 text-xs text-muted">Клиенты, зарегистрированные за {period} дней</p>
          <BarList
            rows={[
              { label: "Зарегистрировались", value: f.registered },
              { label: "Создали книгу", value: f.with_book, note: pct(f.with_book, f.registered) },
              { label: "Ответили на 10+ вопросов", value: f.engaged, note: pct(f.engaged, f.registered) },
              { label: "Оформили заказ", value: f.ordered, note: pct(f.ordered, f.registered) },
              { label: "Оплатили", value: f.paid, note: pct(f.paid, f.registered) },
            ]}
          />
        </section>
      </div>

      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-semibold">Откуда приходят клиенты</h2>
          <Link href={`/admin/marketing?period=${period}`} className="text-xs text-wine hover:underline">
            Все каналы, ссылки и кампании →
          </Link>
        </div>
        {sources.rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-2 font-medium">Канал</th>
                  <th className="py-2 text-right font-medium">Регистрации</th>
                  <th className="py-2 text-right font-medium">Заявки</th>
                  <th className="py-2 text-right font-medium">Продажи</th>
                  <th className="py-2 text-right font-medium">Конверсия</th>
                  <th className="py-2 text-right font-medium">Выручка</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sources.rows.map((r) => (
                  <tr key={r.key}>
                    <td className="py-2">{r.label}</td>
                    <td className="py-2 text-right tabular-nums">{r.registrations}</td>
                    <td className="py-2 text-right tabular-nums">{r.leads}</td>
                    <td className="py-2 text-right tabular-nums">{r.sales}</td>
                    <td className="py-2 text-right text-muted tabular-nums">{pct(r.sales, r.registrations + r.leadsWithoutClient)}</td>
                    <td className="py-2 text-right tabular-nums">{formatPrice(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Пока нет клиентов за период. Создайте рекламные ссылки с UTM-метками в разделе{" "}
            <Link href="/admin/marketing" className="text-wine hover:underline">
              «Ссылки и каналы»
            </Link>
            .
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="mb-5 font-semibold">Выручка по тарифам</h2>
          <BarList
            format={formatPrice}
            rows={plans.map((p) => {
              const r = byPlan.find((b) => b.plan === p.id);
              return { label: planName(p.id), value: r?.sum ?? 0, note: r ? `${r.n} шт.` : undefined };
            })}
          />
        </section>

        <Panel title="Дедлайны клиентов" icon={CalendarClock} href="/admin/board" empty="Ближайших дедлайнов нет">
          {deadlines.map((o) => {
            const days = Math.round((new Date(`${o.desiredDate}T00:00:00`).getTime() - localDay(0).getTime()) / 86_400_000);
            return (
              <Link key={o.id} href={`/admin/orders/${o.id}`} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-cream/40">
                <span className="w-12 font-medium">№{o.number}</span>
                <span className="min-w-0 flex-1 truncate">{o.contactName}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-xs", days < 0 ? "bg-red-100 text-red-700" : days <= 3 ? "bg-amber-100 text-amber-800" : "bg-cream text-ink-soft")}>
                  {days < 0 ? `просрочен ${-days} дн.` : days === 0 ? "сегодня" : `через ${days} дн.`}
                </span>
              </Link>
            );
          })}
        </Panel>

        <Panel title="Мои задачи на сегодня" icon={CheckSquare} href="/admin/tasks" empty="Задач на сегодня нет">
          {tasks.map((t) => (
            <Link key={t.id} href="/admin/tasks" className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-cream/40">
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              {t.dueAt ? (
                <span className={cn("text-xs", t.dueAt < localDay(0) ? "text-red-700" : "text-muted")}>{t.dueAt < localDay(0) ? "просрочена" : "сегодня"}</span>
              ) : null}
            </Link>
          ))}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Требуют внимания" icon={AlertCircle} href="/admin/board" empty="Всё обработано">
          {attention.map((o) => (
            <Link key={o.id} href={`/admin/orders/${o.id}`} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-cream/40">
              <span className="w-12 font-medium">№{o.number}</span>
              <span className="min-w-0 flex-1 truncate">
                {o.contactName} · {planName(o.plan)}
              </span>
              <span className={cn("rounded-full px-2 py-0.5 text-xs", o.status === "paid" ? orderStatusColors.paid : "bg-amber-100 text-amber-800")}>
                {o.status === "paid" ? "передать в печать" : "проверить оплату"}
              </span>
            </Link>
          ))}
        </Panel>
        <Panel title="Последние события" icon={ArrowRight} href="/admin/orders" empty="Событий пока нет">
          {events.map(({ e, number, orderId }) => (
            <Link key={e.id} href={`/admin/orders/${orderId}`} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-cream/40">
              <span className="w-12 font-medium">№{number}</span>
              <span className="min-w-0 flex-1 truncate text-ink-soft">
                {e.status ? <b className="font-medium text-ink">{orderStatusLabel(e.status)}. </b> : null}
                {e.note}
              </span>
              <span className="shrink-0 text-xs text-muted">{formatDate(e.createdAt, true).replace(/ \d{4} г\./, "")}</span>
            </Link>
          ))}
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, icon: Icon, href, empty, children }: { title: string; icon: typeof ArrowRight; href: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Icon className="size-4 text-wine" /> {title}
        </h2>
        <Link href={href} className="text-xs text-muted hover:text-ink">
          Все →
        </Link>
      </div>
      {children.length ? <div className="divide-y divide-line">{children}</div> : <p className="px-5 py-8 text-center text-sm text-muted">{empty}</p>}
    </section>
  );
}
