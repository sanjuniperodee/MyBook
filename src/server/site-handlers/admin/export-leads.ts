import { api, apiStaff } from "@/server/api";
import { audit, can, canWork } from "@/server/access";
import { toCsv } from "@/lib/csv";
import { container } from "@/server/container";
import { storeTimeZone } from "@/shared/domain/time";
import { uuid } from "@/server/input";
import { financePeriod } from "@/modules/reporting/ui/finance-screen";
import { leadStatsScreen } from "@/modules/reporting/ui/lead-stats";

/**
 * Выгрузка «Статистики лидов» — таблица по дням за период (p, from, to, m — как в адресе страницы), с той же видимостью:
 * роль «только свои» получает свои сделки и не получает расход на рекламу.
 */
export const GET = api(async (req) => {
  const staff = await apiStaff(req, "analytics.view");
  const sp = new URL(req.url).searchParams;
  const tz = storeTimeZone();
  const now = new Date();
  const period = financePeriod({ preset: sp.get("p") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, now, tz });
  const c = container();
  const [data, admins] = await Promise.all([c.reporting.leadStats({ from: period.prev.from, to: period.to, first: period.first, last: period.last }), c.access.queries.allStaff()]);
  const m = uuid.safeParse(sp.get("m"));
  const managerId = m.success && admins.some((a) => a.id === m.data && canWork(staff, a.id)) ? m.data : null;
  const showSpend = staff.scope === "all" && can(staff, "finance.view");
  const s = leadStatsScreen({ period, ...data, staff: admins, visible: (id) => canWork(staff, id), showSpend, managerId, tz, now });
  await audit(staff, "export", "leads", null, { first: period.first, last: period.last, managerId });
  // Десятичная запятая: Excel с русской локалью читает «10,2» числом, а «10.2» — текстом или датой.
  const share = (v: number | null) => (v === null ? "" : String(Math.round(v * 1000) / 10).replace(".", ","));
  const head = ["День", "Заявки", "Нецелевые", "Счета", "Оплаты", "Конверсия, %", "Первые оплаты, ₸", "По договорам, ₸", "Средний договор, ₸"];
  const csv = toCsv(
    showSpend ? [...head, "Реклама, ₸", "Заявка, ₸", "Покупатель, ₸", "Доля рекламы, %"] : head,
    s.daily.map((d) => {
      const row = [d.day, d.leads, d.junk, d.invoices, d.payments, share(d.conversion), d.first, d.agreed, d.avgCheck ?? ""];
      return showSpend ? [...row, d.spend, d.cpl ?? "", d.cac ?? "", share(d.adShare)] : row;
    }),
  );
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="leads-${period.first}_${period.last}.csv"`, "Cache-Control": "no-store" } });
});
