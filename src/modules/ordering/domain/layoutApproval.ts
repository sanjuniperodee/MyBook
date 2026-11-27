import type { OrderStatus } from "@/shared/domain/orders";

/**
 * Согласование итогового макета клиентом (решение владельца 27.11.2026, заказ №93): файлы для типографии нельзя скачать
 * и заказ нельзя отправить в печать, пока покупатель сам не согласовал книгу — ровно ту версию, что уйдёт в печать.
 *
 * Версия книги — отпечаток печати (printFingerprint, производство): текст, фото, раскладка и всё, что на обложке.
 * Согласие привязано к отпечатку: книгу изменили после согласования — согласие не действует. «Открыть для правок»
 * сбрасывает согласие явно (revokedAt), даже если потом ничего не поменяли: клиент согласует заново.
 */
export interface LayoutApproval {
  /** Нужно ли согласование: печатный тариф. Заказы, которые к выпуску уже были в печати и дальше, — без него. */
  required: boolean;
  approvedAt: Date | null;
  /** Отпечаток книги, которую клиент согласовал. */
  fingerprint: string | null;
  /** Когда согласие сбросили (книгу открыли для правок): ждём повторного. */
  revokedAt: Date | null;
}

export const NO_LAYOUT_APPROVAL: LayoutApproval = { required: false, approvedAt: null, fingerprint: null, revokedAt: null };

/** Книга сейчас: её отпечаток печати (null — книги нет) и открыта ли она для правок (статус книги «черновик»). */
export interface CurrentLayout {
  fingerprint: string | null;
  bookOpen: boolean;
}

/**
 * Состояние согласования: notRequired — не нужно (электронный тариф, старый заказ); editing — книга открыта для правок,
 * согласовать нельзя; pending — ждёт согласования клиента (again — повторного, после «Открыть для правок»);
 * changed — согласовали, но книгу потом изменили; approved — согласована именно эта версия.
 */
export type LayoutApprovalState = "notRequired" | "editing" | "pending" | "changed" | "approved";

/** Почему печатные файлы и печать закрыты — код ошибки (OrderingError и HttpError, тексты — словарь api). */
export type LayoutBlock = "layoutNotApproved" | "layoutChanged" | "layoutBookEditing";

export function layoutApprovalState(a: LayoutApproval, current: CurrentLayout | null): { state: LayoutApprovalState; again: boolean } {
  const again = !!a.revokedAt && !a.approvedAt;
  if (!a.required) return { state: "notRequired", again: false };
  // Не знаем книгу сейчас — не считаем согласованной: закрыто, пока не проверим.
  if (!current) return { state: a.approvedAt ? "changed" : "pending", again };
  if (current.bookOpen) return { state: "editing", again: again || !!a.approvedAt };
  if (!a.approvedAt || !a.fingerprint) return { state: "pending", again };
  if (!current.fingerprint || current.fingerprint !== a.fingerprint) return { state: "changed", again: false };
  return { state: "approved", again: false };
}

/** Что мешает выдать печатные файлы (и отправить в печать); null — можно. Единая проверка для всех путей. */
export function layoutBlock(a: LayoutApproval, current: CurrentLayout | null): LayoutBlock | null {
  const { state } = layoutApprovalState(a, current);
  if (state === "notRequired" || state === "approved") return null;
  if (state === "editing") return "layoutBookEditing";
  return state === "changed" ? "layoutChanged" : "layoutNotApproved";
}

/** Согласование нужно печатному заказу, который ещё не ушёл в печать (и не отменён). */
export function layoutApprovalRequired(printed: boolean, status: OrderStatus): boolean {
  return printed && (status === "pending_payment" || status === "paid");
}

/**
 * Может ли покупатель согласовать макет сейчас: печатный заказ, который ещё не отправлен (ждёт оплаты — для постоплаты,
 * оплачен или уже в печати, но книгу открывали для правок), книга закрыта для правок. null — можно; иначе код отказа.
 */
export function layoutApprovalRefusal(order: { status: OrderStatus; layoutApproval: LayoutApproval }, current: CurrentLayout): LayoutBlock | "layoutNotNeeded" | null {
  if (!order.layoutApproval.required) return "layoutNotNeeded";
  if (order.status !== "pending_payment" && order.status !== "paid" && order.status !== "in_production") return "layoutNotNeeded";
  if (current.bookOpen) return "layoutBookEditing";
  if (!current.fingerprint) return "layoutNotApproved";
  return null;
}
