import { api, apiStaff } from "@/server/api";
import { audit, canWork, contactView } from "@/server/access";
import { toCsv } from "@/lib/csv";
import { container } from "@/server/container";
import { storeTimeZone } from "@/shared/domain/time";
import { formatPhone } from "@/shared/domain/phone";
import { financePeriod } from "@/modules/reporting/ui/finance-screen";
import { salesRegisterScreen } from "@/modules/reporting/ui/lead-stats";

/** Выгрузка «Реестра продаж» за период — те же строки и видимость, что на странице; телефон — по правам сотрудника. */
export const GET = api(async (req) => {
  const staff = await apiStaff(req, "analytics.view");
  const sp = new URL(req.url).searchParams;
  const tz = storeTimeZone();
  const period = financePeriod({ preset: sp.get("p") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, now: new Date(), tz });
  const c = container();
  const [rows, admins] = await Promise.all([c.reporting.salesRegister({ from: period.from, to: period.to }), c.access.queries.allStaff()]);
  const s = salesRegisterScreen({ rows, staff: admins, visible: (id) => canWork(staff, id), contact: (phone) => (phone ? contactView(staff, { phone: formatPhone(phone) }).phone : ""), tz });
  await audit(staff, "export", "sales", null, { first: period.first, last: period.last, rows: s.rows.length });
  const csv = toCsv(
    ["Дата продажи", "Сделка", "Дата заявки", "Клиент", "Телефон", "Город", "Источник", "Менеджер", "Тариф", "Книг", "Кому", "К дате", "Цена, ₸", "Оплачено, ₸", "Остаток, ₸", "Состояние", "Этап", "Способ оплаты", "Заказ"],
    s.rows.map((r) => [r.day, `Д${r.number}`, r.createdDay, r.client, r.phone, r.city, r.channel, r.manager, r.plan, r.quantity, r.recipient, r.eventDate, r.price, r.paid, r.rest, r.state, r.stage, r.method, r.orderNumber ? `№${r.orderNumber}` : ""]),
  );
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sales-${period.first}_${period.last}.csv"`, "Cache-Control": "no-store" } });
});
