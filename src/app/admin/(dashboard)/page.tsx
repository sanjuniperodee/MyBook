import { container } from "@/server/container";
import { iso, localDay } from "@/modules/reporting/time";
import { storeTimeZone } from "@/shared/domain/time";
import { planName } from "@/i18n/labels";
import Link from "next/link";
import { AlertCircle, ArrowRight, CalendarClock } from "lucide-react";
import { formatPrice, getPlans } from "@/config/site";
import { orderStatusColors, orderStatusLabel } from "@/modules/ordering/ui/status";
import { can, requireStaff, staffViewer } from "@/server/access";
import { redirect } from "next/navigation";
import { layoutTabs, mobileLayout } from "@/shared/domain/mobileLayout";
import { MyDay } from "../MyDay";
import { BarList, RevenueColumns, StatTile, type DayPoint } from "@/components/admin/charts";
import { cn } from "@/lib/class-names";
import { formatDate } from "@/lib/dates";

export const metadata = { title: "Обзор" };

const periods = [7, 30, 90] as const;
const change = (cur: number, prev: number) => (prev ? (cur - prev) / prev : cur ? null : 0);

/** Изменение к прошлому периоду на плитке телефона: ▲ 12 % зелёным, ▼ 8 % красным (на цветной карточке — белым). */
function Delta({ value, light = false }: { value: number | null; light?: boolean }) {
  if (value === null) return <span className="font-semibold">новое</span>;
  if (value === 0) return null;
  const up = value > 0;
  return (
    <span className={cn("font-semibold", light ? "text-white" : up ? "text-emerald-600" : "text-red-600")}>
      {up ? "▲" : "▼"} {Math.abs(Math.round(value * 100))}%
    </span>
  );
}

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
  const { daily, cur, prev, newUsers, funnelRows, byPlan, deadlines, dealDeadlines, attention, events } = await container().reporting.dashboard(period, staffViewer(staff));

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
    <div className="flex flex-col gap-6">
      <div className="order-[-2] flex flex-wrap items-center justify-between gap-3">
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

      {/* Телефон — как «Обзор» в приложении: карточка выручки с графиком и три плитки. */}
      <div className="order-[-1] space-y-3 lg:hidden" data-testid="overview-mobile">
        <div className="rounded-3xl bg-gradient-to-br from-wine to-wine-dark p-4 text-white shadow-lift">
          <div className="flex items-center justify-between text-sm text-white/75">
            <span className="font-medium">Выручка</span>
            <Delta value={change(cur.sum, prev.sum)} light />
          </div>
          <div className="mt-1 text-[2rem] leading-tight font-extrabold tracking-tight tabular-nums">{formatPrice(cur.sum)}</div>
          <div className="text-xs text-white/70">
            за {period} дней · прошлые {period} — {formatPrice(prev.sum)}
          </div>
          <div className="mt-3 flex h-16 items-end gap-[2px]" aria-hidden>
            {series.map((p) => {
              const max = Math.max(1, ...series.map((x) => x.value));
              return <span key={p.date} className={cn("flex-1 rounded-sm", p.value ? "bg-white/90" : "bg-white/20")} style={{ height: `${Math.max(5, (p.value / max) * 100)}%` }} />;
            })}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { label: "Продажи", value: cur.n.toLocaleString("ru-RU"), d: change(cur.n, prev.n) },
            { label: "Средний чек", value: formatPrice(avg), d: change(avg, prevAvg) },
            { label: "Клиенты", value: newUsers.cur.toLocaleString("ru-RU"), d: change(newUsers.cur, newUsers.prev) },
          ].map((t) => (
            <div key={t.label} className="flex flex-col rounded-2xl border border-line bg-white p-3">
              <div className="text-[1.05rem] leading-tight font-extrabold tabular-nums">{t.value}</div>
              <div className="mt-0.5 text-xs text-muted">{t.label}</div>
              <div className="mt-1 text-xs">
                <Delta value={t.d} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden gap-4 sm:grid-cols-2 lg:grid xl:grid-cols-4">
        <StatTile label="Выручка" value={formatPrice(cur.sum)} delta={change(cur.sum, prev.sum)} />
        <StatTile label="Оплаченные продажи" value={cur.n.toLocaleString("ru-RU")} delta={change(cur.n, prev.n)} />
        <StatTile label="Средний чек" value={formatPrice(avg)} delta={change(avg, prevAvg)} />
        <StatTile label="Новые клиенты" value={newUsers.cur.toLocaleString("ru-RU")} delta={change(newUsers.cur, newUsers.prev)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-line bg-white p-5">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="font-semibold">Выручка по дням</h2>
            <span className="text-xs text-muted">по дате оплаты, {storeTimeZone()}: заказы и платежи менеджеров</span>
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
              { label: "Начали писать текст книги", value: f.engaged, note: pct(f.engaged, f.registered) },
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
            <table className="w-full min-w-[520px] [&_tr>*:first-child]:sticky [&_tr>*:first-child]:left-0 [&_tr>*:first-child]:bg-white [&_tr>*:first-child]:z-[1] text-sm">
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

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="mb-5 font-semibold">Выручка по тарифам</h2>
          <BarList
            format={formatPrice}
            rows={[
              ...getPlans().map((p) => {
                const r = byPlan.find((b) => b.plan === p.id);
                return { label: planName(p.id), value: r?.sum ?? 0, note: r ? `${r.n} шт.` : undefined };
              }),
              // Деньги по ручным сделкам (предоплаты, доплаты, продажи в чате) — отдельной строкой, чтобы сумма сходилась с «Выручкой».
              ...(byPlan.find((b) => b.plan === "manual") ? [{ label: "Продажи менеджеров", value: byPlan.find((b) => b.plan === "manual")!.sum, note: `${byPlan.find((b) => b.plan === "manual")!.n} шт.` }] : []),
            ]}
          />
        </section>

        <Panel title="Дедлайны клиентов" icon={CalendarClock} href="/admin/board" empty="Ближайших дедлайнов нет">
          {[
            ...deadlines.map((o) => ({ key: `o${o.id}`, href: `/admin/orders/${o.id}`, label: `№${o.number}`, name: o.contactName, due: o.desiredDate as string })),
            // Сроки ручных сделок: «Д» + номер сделки; с пометкой, сколько уже получено.
            ...dealDeadlines.map((d) => ({ key: `d${d.id}`, href: `/admin/deals/${d.id}`, label: `Д${d.number}`, name: `${d.contact_name || d.title}${d.paid ? ` · получено ${formatPrice(d.paid)}` : ""}`, due: d.due })),
          ]
            .sort((a, b) => a.due.localeCompare(b.due))
            .slice(0, 8)
            .map((o) => {
              const days = Math.round((new Date(`${o.due}T00:00:00`).getTime() - localDay(0).getTime()) / 86_400_000);
              return (
                <Link key={o.key} href={o.href} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-cream/40">
                  <span className="w-12 font-medium">{o.label}</span>
                  <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs", days < 0 ? "bg-red-100 text-red-700" : days <= 3 ? "bg-amber-100 text-amber-800" : "bg-cream text-ink-soft")}>
                    {days < 0 ? `просрочен ${-days} дн.` : days === 0 ? "сегодня" : `через ${days} дн.`}
                  </span>
                </Link>
              );
            })}
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
