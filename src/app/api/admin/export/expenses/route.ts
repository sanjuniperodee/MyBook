import { api, apiStaff } from "@/server/api";
import { audit } from "@/server/access";
import { toCsv } from "@/lib/csv";
import { container } from "@/server/container";
import { storeTimeZone } from "@/shared/domain/time";
import { financePeriod } from "@/modules/reporting/ui/finance-screen";
import { expensesScreen } from "@/modules/reporting/ui/profit-screen";

/** Выгрузка «Расходов» за период — те же строки, что на странице (p, from, to — как в её адресе). */
export const GET = api(async (req) => {
  const staff = await apiStaff(req, "finance.view");
  const sp = new URL(req.url).searchParams;
  const period = financePeriod({ preset: sp.get("p") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, now: new Date(), tz: storeTimeZone() });
  const c = container();
  const [rows, admins] = await Promise.all([c.reporting.expenses(period.first, period.last), c.access.queries.allStaff()]);
  const s = expensesScreen({ period, expenses: rows, staff: admins });
  await audit(staff, "export", "expenses", null, { first: period.first, last: period.last, rows: s.rows.length });
  const csv = toCsv(
    ["День", "Категория", "Что", "Сумма, ₸", "Количество", "Заметка", "Внёс"],
    s.rows.map((r) => [r.day, r.label, r.name, r.amount, r.quantity ?? "", r.note, r.by]),
  );
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="expenses-${period.first}_${period.last}.csv"`, "Cache-Control": "no-store" } });
});
