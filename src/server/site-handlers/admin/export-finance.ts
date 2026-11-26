import { api, apiStaff } from "@/server/api";
import { audit, canWork } from "@/server/access";
import { toCsv } from "@/lib/csv";
import { container } from "@/server/container";
import { storeTimeZone } from "@/shared/domain/time";
import { financePeriod, financeScreen } from "@/modules/reporting/ui/finance-screen";

/**
 * Выгрузка «Финансов» за выбранный период — те же строки и та же видимость, что на странице (p, from, to — как в адресе
 * страницы): каждое движение денег один раз, возвраты со знаком минус. Сумма колонки «Сумма» = «Пришло денег».
 */
export const GET = api(async (req) => {
  const staff = await apiStaff(req, "analytics.view");
  const sp = new URL(req.url).searchParams;
  const tz = storeTimeZone();
  const now = new Date();
  const period = financePeriod({ preset: sp.get("p") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, now, tz });
  const c = container();
  const [data, admins] = await Promise.all([c.reporting.finance({ from: period.prev.from, to: period.to }), c.access.queries.allStaff()]);
  const s = financeScreen({ period, ...data, staff: admins, visible: (id) => canWork(staff, id), tz, now });
  await audit(staff, "export", "finance", null, { first: period.first, last: period.last, rows: s.recent.length });
  const csv = toCsv(
    ["День", "Сумма, ₸", "Способ", "Что", "Сделка / заказ", "Клиент", "Ответственный", "Принял", "Операция", "Проверено"],
    s.recent.map((r) => [
      r.day,
      r.amount,
      r.method,
      r.what,
      r.refs.map((x) => x.label).join(", "),
      r.client,
      r.manager,
      r.acceptedBy,
      r.operation ?? "",
      r.check === "reviewed" ? "да" : r.check === "pending" ? "нет" : "",
    ]),
  );
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="finance-${period.first}_${period.last}.csv"`, "Cache-Control": "no-store" },
  });
});
