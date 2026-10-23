import { api, apiStaff } from "@/server/api";
import { audit, contactView } from "@/server/access";
import { toCsv } from "@/lib/csv";
import { container } from "@/server/container";

/**
 * Все поступления денег (телефоны — по праву «видеть контакты полностью», как везде в CRM) (оплаченные заказы и платежи
 * менеджеров) — тот же журнал, из которого считаются обзор и аналитика. Успешная сделка без заказа и без платежей входит
 * суммой договорённости — так и подписана (analytics-d6).
 */
export const GET = api(async (req) => {
  const staff = await apiStaff(req, "analytics.view");
  const sp = new URL(req.url).searchParams;
  const days = Math.min(3650, Math.max(1, Number(sp.get("days")) || 90));
  await audit(staff, "export", "payments", null, { days });
  const rows = await container().reporting.paymentsExport(days);
  const csv = toCsv(
    ["Дата оплаты", "Сумма, ₸", "Откуда", "Тип", "Заказ / сделка", "Клиент", "Телефон", "Менеджер", "Чек приложен"],
    rows.map((r) => [r.at, r.amount, r.kind === "order" ? "заказ на сайте" : r.kind === "payment" ? "платёж менеджеру" : r.kind === "refund" ? "возврат клиенту" : "успешная сделка без платежа (сумма договорённости, денег в журнале нет)", r.type, r.ref, r.client, contactView(staff, { phone: r.phone }).phone, r.manager, r.receipt]),
  );
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="payments-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" },
  });
});
