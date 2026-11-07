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

/** Тон значка статуса (DESIGN.md §3): статусные пары токенов, а не палитра — тёмная тема работает сама. */
export type OrderStatusTone = "warning" | "success" | "info" | "accent" | "neutral" | "danger";
export const orderStatusTone: Record<OrderStatus, OrderStatusTone> = {
  pending_payment: "warning",
  paid: "success",
  in_production: "info",
  shipped: "accent",
  delivered: "neutral",
  cancelled: "danger",
};

/** Классы значка статуса — для разметки без <Badge> (кабинет клиента, поиск). */
export const orderStatusColors: Record<OrderStatus, string> = {
  pending_payment: "bg-warning-bg text-warning",
  paid: "bg-success-bg text-success",
  in_production: "bg-info-bg text-info",
  shipped: "bg-rose text-wine",
  delivered: "bg-sunken text-ink-soft",
  cancelled: "bg-danger-bg text-danger",
};

/** Точка статуса (колонки производства, ленты статусов на телефоне). */
export const orderStatusDot: Record<OrderStatus, string> = {
  pending_payment: "bg-warning",
  paid: "bg-success",
  in_production: "bg-info",
  shipped: "bg-wine",
  delivered: "bg-muted",
  cancelled: "bg-danger",
};
