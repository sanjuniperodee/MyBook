import type { Locale } from "@/i18n/config";
import { getPlan } from "@/config/site";
import { orderStatusFor } from "@/i18n/messages/partial";
import type { OrderStatus } from "@/shared/domain/orders";

/** Подписи статусов по-русски — для CRM. Для клиента — orderStatusLabel(s, locale). */
export const orderStatusLabels: Record<OrderStatus, string> = orderStatusFor("ru").all;

/**
 * Подпись статуса. У электронной версии (printed = false) оплаченный заказ — уже выполненный: файлы выдаются сразу,
 * печатать и отправлять нечего, поэтому вместо «Оплачен» — «Выполнен».
 */
export function orderStatusLabel(s: string, locale: Locale = "ru", printed = true) {
  const m = orderStatusFor(locale);
  if (!printed && s === "paid") return m.digital.paid;
  return m.all[s as OrderStatus] ?? s;
}

/** Печатный ли тариф заказа (неизвестный — как печатный: старые тарифы печатались). */
export const isPrintedPlan = (plan: string) => getPlan(plan)?.printed ?? true;

export const orderStatusColors: Record<OrderStatus, string> = {
  pending_payment: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  in_production: "bg-sky-100 text-sky-800",
  shipped: "bg-indigo-100 text-indigo-800",
  delivered: "bg-stone-200 text-stone-700",
  cancelled: "bg-red-100 text-red-700",
};
