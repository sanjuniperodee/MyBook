import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import type { OrderStatus } from "../domain/OrderStatus";

/** Подписи статусов по-русски — для CRM. Для клиента — orderStatusLabel(s, locale). */
export const orderStatusLabels: Record<OrderStatus, string> = messagesFor("ru").common.orderStatus;

export function orderStatusLabel(s: string, locale: Locale = "ru") {
  return messagesFor(locale).common.orderStatus[s as OrderStatus] ?? s;
}

export const orderStatusColors: Record<OrderStatus, string> = {
  pending_payment: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  in_production: "bg-sky-100 text-sky-800",
  shipped: "bg-indigo-100 text-indigo-800",
  delivered: "bg-stone-200 text-stone-700",
  cancelled: "bg-red-100 text-red-700",
};
