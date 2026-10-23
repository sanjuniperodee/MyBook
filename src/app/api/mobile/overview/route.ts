import { NextResponse } from "next/server";
import { apiStaff, HttpError } from "@/server/api";
import { can, staffViewer } from "@/server/access";
import { container } from "@/server/container";
import { mobile } from "@/server/mobile-api";
import { planName } from "@/i18n/labels";

export const dynamic = "force-dynamic";

/**
 * «Обзор» для руководителя и аналитика: деньги за период с прошлым периодом, выручка по дням, воронка клиентов, тарифы,
 * сделки по этапам и что требует внимания. Те же выборки, что у дашборда CRM (право «Аналитика»).
 */
export const GET = mobile(async (req) => {
  const staff = await apiStaff(req);
  if (!can(staff, "analytics.view")) throw new HttpError(403, "forbidden");
  const raw = Number(new URL(req.url).searchParams.get("period"));
  const period = [7, 30, 90].includes(raw) ? raw : 30;
  const c = container();
  const [d, live, stageCounts, stages] = await Promise.all([
    c.reporting.dashboard(period, staffViewer(staff)),
    c.reporting.live(staff.context),
    can(staff, "deals.view") ? c.reporting.stageCounts() : Promise.resolve([]),
    can(staff, "deals.view") ? c.sales.queries.listStages() : Promise.resolve([]),
  ]);
  const f = d.funnelRows.rows[0] ?? { registered: 0, with_book: 0, engaged: 0, ordered: 0, paid: 0 };
  const byStage = new Map(stageCounts.map((s) => [s.stageId, s.n]));
  const avg = (x: { sum: number; n: number }) => (x.n ? Math.round(x.sum / x.n) : 0);
  return NextResponse.json({
    period,
    revenue: { cur: d.cur.sum, prev: d.prev.sum },
    sales: { cur: d.cur.n, prev: d.prev.n },
    avgCheck: { cur: avg(d.cur), prev: avg(d.prev) },
    newClients: { cur: d.newUsers.cur, prev: d.newUsers.prev },
    series: d.daily.map((r) => ({ day: r.d, sum: r.sum, n: r.n })),
    funnel: { registered: f.registered, withBook: f.with_book, engaged: f.engaged, ordered: f.ordered, paid: f.paid },
    byPlan: d.byPlan.map((p) => ({ plan: p.plan, label: planName(p.plan), sum: p.sum, n: p.n })).sort((a, b) => b.sum - a.sum),
    stages: stages.filter((s) => s.kind === "open").map((s) => ({ id: s.id, name: s.name, color: s.color, n: byStage.get(s.id) ?? 0 })),
    // Что горит: заказы к печати и с «клиент оплатил», счётчики CRM (чаты ждут ответа, просроченные задачи и т. д.).
    attention: { orders: d.attention.length, deadlines: d.deadlines.length + d.dealDeadlines.length },
    counters: live.counters,
  });
});
