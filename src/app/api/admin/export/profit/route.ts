import { api, apiStaff } from "@/server/api";
import { audit } from "@/server/access";
import { toCsv } from "@/lib/csv";
import { container } from "@/server/container";
import { storeTimeZone, zonedDay } from "@/shared/domain/time";
import { financePeriod } from "@/modules/reporting/ui/finance-screen";
import { profitScreen } from "@/modules/reporting/ui/profit-screen";

/** Выгрузка «Прибыли» за период: таблица по дням, неделям или месяцам (как на странице) и строка «Итого». */
export const GET = api(async (req) => {
  const staff = await apiStaff(req, "finance.view");
  const sp = new URL(req.url).searchParams;
  const tz = storeTimeZone();
  const period = financePeriod({ preset: sp.get("p") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, now: new Date(), tz });
  const prev = { ...period.prev, first: zonedDay(period.prev.from, tz), last: zonedDay(new Date(period.prev.to.getTime() - 1), tz) };
  const data = await container().reporting.profit({ from: period.from, to: period.to, first: period.first, last: period.last, prev });
  const s = profitScreen({ period, ...data, tz });
  await audit(staff, "export", "profit", null, { first: period.first, last: period.last });
  const t = s.totals;
  const csv = toCsv(
    ["Период", "Выручка, ₸", "Себестоимость, ₸", "Реклама, ₸", "Команда, ₸", "Прочее, ₸", "Расходы всего, ₸", "Прибыль, ₸"],
    [...s.rows.map((r) => [r.label, r.revenue, r.cogs, r.marketing, r.team, r.operating, r.expenses, r.profit]), ["Итого", t.revenue, t.cogs, t.marketing, t.team, t.operating, t.expenses, t.profit]],
  );
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="profit-${period.first}_${period.last}.csv"`, "Cache-Control": "no-store" } });
});
