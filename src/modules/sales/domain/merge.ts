import type { StageKind } from "./Funnel";

/** Сделка в решении «можно ли слить»: вид её этапа (null — этап не найден, как открытая), заказ и даты. */
export interface MergeSide {
  kind: StageKind | null;
  orderId: string | null;
  createdAt: Date | null;
  closedAt: Date | null;
}

/** По умолчанию в успешную сделку заказа вливают заявку, пришедшую не дальше 14 дней от её закрытия («crm.mergeClosedDays»). */
export const DEFAULT_MERGE_CLOSED_DAYS = 14;
export const MERGE_CLOSED_DAYS_MAX = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Почему source нельзя влить в target (null — можно).
 * - mergeClosed: source закрыта (успех или отказ) — это прошлая покупка или отказ, она нужна в плане, воронке и у своего заказа.
 * - mergeIntoClosed: target закрыта. Новая заявка того же человека — новая продажа: влитая в закрытую сделку, она уходит из
 *   работы, плана и воронки, а её открытые счета отменяются. Исключение одно — та же покупка: target успешна, по ней заказ,
 *   а заявка пришла не дальше windowDays дней от её закрытия (до или после: переписка в WhatsApp о заказе с сайта, который
 *   завёл свою сделку). windowDays = 0 — в закрытые сделки не вливают вовсе.
 */
export function mergeRefusal(target: MergeSide, source: MergeSide, windowDays: number): "mergeClosed" | "mergeIntoClosed" | null {
  if (source.kind && source.kind !== "open") return "mergeClosed";
  if (!target.kind || target.kind === "open") return null;
  return sameOrder(target, source, windowDays) ? null : "mergeIntoClosed";
}

function sameOrder(target: MergeSide, source: MergeSide, windowDays: number) {
  if (target.kind !== "won" || !target.orderId || windowDays <= 0) return false;
  const closed = target.closedAt ?? target.createdAt;
  if (!closed || !source.createdAt) return false;
  return Math.abs(source.createdAt.getTime() - closed.getTime()) <= windowDays * DAY_MS;
}
