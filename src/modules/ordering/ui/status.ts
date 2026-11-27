import type { Locale } from "@/i18n/config";
import { getPlan } from "@/config/site";
import { orderStatusFor } from "@/i18n/messages/partial";
import type { OrderStatus } from "@/shared/domain/orders";
import type { ProductionStage } from "../domain/productionStage";

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

/** Заказ книги для полки: последний, но отменённый не заслоняет действующий (заказы — от новых к старым). */
export function lastOrderPerBook<T extends { bookId: string; status: string }>(orders: readonly T[]): Map<string, T> {
  const last = new Map<string, T>();
  for (const o of orders) {
    const seen = last.get(o.bookId);
    if (!seen || (seen.status === "cancelled" && o.status !== "cancelled")) last.set(o.bookId, o);
  }
  return last;
}

/** Тон значка статуса (DESIGN.md §3): статусные пары токенов, а не палитра — тёмная тема работает сама. */
export type OrderStatusTone = "warning" | "success" | "info" | "accent" | "neutral" | "danger";
export const orderStatusTone: Record<OrderStatus, OrderStatusTone> = {
  pending_payment: "warning",
  paid: "success",
  in_production: "info",
  // «В пути» — тот же синий, что «в производстве» (заказ в работе, различие — в подписи): винный рядом с красным
  // «отменён» читается как тревога.
  shipped: "info",
  delivered: "neutral",
  cancelled: "danger",
};

/** Классы значка статуса — для разметки без <Badge> (кабинет клиента, поиск). */
export const orderStatusColors: Record<OrderStatus, string> = {
  pending_payment: "bg-warning-bg text-warning",
  paid: "bg-success-bg text-success",
  in_production: "bg-info-bg text-info",
  shipped: "bg-info-bg text-info",
  delivered: "bg-sunken text-ink-soft",
  cancelled: "bg-danger-bg text-danger",
};

/** Точка статуса (колонки производства, ленты статусов на телефоне). */
export const orderStatusDot: Record<OrderStatus, string> = {
  pending_payment: "bg-warning",
  paid: "bg-success",
  in_production: "bg-info",
  shipped: "bg-info",
  delivered: "bg-muted",
  cancelled: "bg-danger",
};


/** Этапы производства (доска заказов): подпись, подсказка под колонкой и точка — те же статусные токены. */
export const productionStageLabels: Record<ProductionStage, { label: string; hint: string; dot: string }> = {
  awaiting_payment: { label: "Ждёт оплаты", hint: "Заказ оформлен, оплаты ещё нет", dot: "bg-warning" },
  approval: { label: "На согласовании", hint: "Клиент проверяет макет в кабинете", dot: "bg-warning" },
  revisions: { label: "Правки", hint: "Книга открыта для правок — после них клиент согласует заново", dot: "bg-danger" },
  queued: { label: "В очереди на печать", hint: "Макет согласован — передайте в типографию", dot: "bg-success" },
  printing: { label: "В печати", hint: "Книга в типографии", dot: "bg-info" },
  printed: { label: "Книга готова", hint: "Напечатана — упаковать и отправить", dot: "bg-success" },
  shipped: { label: "Отправлен", hint: "В пути к клиенту", dot: "bg-info" },
  delivered: { label: "Получен", hint: "За последний месяц", dot: "bg-muted" },
};
