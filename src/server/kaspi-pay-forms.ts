import "server-only";
import { container } from "@/server/container";

/** Окно истории кассы: оплаты за последние двое суток (старые размечены разово при запуске). */
const WINDOW_MS = 2 * 24 * 3600_000;

/**
 * Форма оплаты онлайн-платежей Kaspi — сама, из истории кассы: Kaspi Gold, рассрочка или Red у каждого платежа заказа
 * и счёта из чата (по номеру операции), и форма сделки, если её ещё не выбрали. По форме платежа «Прибыль» и
 * «Реестр продаж» считают комиссию банка. Сколько платежей отмечено.
 */
export async function tagKaspiPayForms(now = new Date()): Promise<number> {
  const c = container();
  const forms = await c.ordering.kaspi.payFormsSince(new Date(now.getTime() - WINDOW_MS));
  if (!Object.keys(forms).length) return 0;
  const orders = await c.ordering.payments.tagKaspiForms(forms);
  const deals = await c.sales.payments.tagKaspiForms(forms);
  for (const o of orders) for (const d of await c.sales.deals.byOrder(o.orderId)) await c.sales.deals.notePayForm(d.id, o.form);
  for (const d of deals) await c.sales.deals.notePayForm(d.dealId, d.form);
  return orders.length + deals.length;
}
