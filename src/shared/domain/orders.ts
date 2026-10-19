/**
 * Заказ и сертификат: справочники, которые лежат в колонках БД и нужны сразу нескольким слоям —
 * домену заказов, производству, отчётам, интерфейсу и схеме. Схема (общее ядро) не знает модулей,
 * поэтому значения, которые она хранит, объявлены здесь.
 */

/** Жизненный цикл заказа. Единственный источник списка статусов. */
export const ORDER_STATUSES = ["pending_payment", "paid", "in_production", "shipped", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Параметры печатных файлов заказа на момент последней сборки (колонка orders.print_spec). */
export interface OrderPrintSpec {
  format: string;
  pageCount: number;
  spineMm: number;
  coverWidthMm: number;
  coverHeightMm: number;
  generatedAt: string;
}

export type GiftStatus = "pending_payment" | "paid" | "cancelled";

/**
 * Объект срабатывания правила CRM на событие заказа (crm_automation_runs.subject): «Статус заказа изменился» — один раз
 * на статус (откат и повторный перевод клиенту не повторяются), «Заказ отправлен с трек-номером» — один раз на номер,
 * «Заказ оплачен» — один раз на заказ (subject — id заказа). По ним подпись в карточке заказа знает, о чём правило
 * клиенту уже писало.
 */
export const orderRuleSubject = {
  status: (orderId: string, status: string) => `order:status:${orderId}:${status}`,
  track: (orderId: string, trackingNumber: string) => `order:track:${orderId}:${trackingNumber}`,
} as const;
