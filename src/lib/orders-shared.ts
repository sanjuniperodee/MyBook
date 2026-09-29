import type { OrderStatus } from "./db/schema";

export const orderStatusLabels: Record<OrderStatus, string> = {
  pending_payment: "Ожидает оплаты",
  paid: "Оплачен",
  in_production: "В производстве",
  shipped: "Отправлен",
  delivered: "Доставлен",
  cancelled: "Отменён",
};

export function orderStatusLabel(s: string) {
  return orderStatusLabels[s as OrderStatus] ?? s;
}

export const orderStatusColors: Record<OrderStatus, string> = {
  pending_payment: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  in_production: "bg-sky-100 text-sky-800",
  shipped: "bg-indigo-100 text-indigo-800",
  delivered: "bg-stone-200 text-stone-700",
  cancelled: "bg-red-100 text-red-700",
};
