import { storeTimeZone } from "./time";

/** Чек об оплате: скриншот или фото перевода, PDF из банка. */
export const RECEIPT_MAX_BYTES = 12 * 1024 * 1024;

export type ReceiptType = { ext: "jpg" | "png" | "webp" | "pdf"; mime: string };

const starts = (b: Uint8Array, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);

/** Тип файла определяется по содержимому, а не по имени и заявленному типу: подмена расширения не пройдёт. */
export function sniffReceipt(bytes: Uint8Array): ReceiptType | null {
  if (starts(bytes, [0xff, 0xd8, 0xff])) return { ext: "jpg", mime: "image/jpeg" };
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: "png", mime: "image/png" };
  if (starts(bytes, [0x52, 0x49, 0x46, 0x46]) && starts(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return { ext: "webp", mime: "image/webp" };
  if (starts(bytes, [0x25, 0x50, 0x44, 0x46])) return { ext: "pdf", mime: "application/pdf" };
  return null;
}

export type ReceiptProblem = "empty" | "tooBig" | "type";

/** Почему файл не годится в чек: пустой, больше RECEIPT_MAX_BYTES или по содержимому не JPG, PNG, WEBP и не PDF. */
export function receiptProblem(bytes: Uint8Array): ReceiptProblem | null {
  if (!bytes.length) return "empty";
  if (bytes.length > RECEIPT_MAX_BYTES) return "tooBig";
  return sniffReceipt(bytes) ? null : "type";
}

/** Имя файла для показа: без путей и управляющих символов, не длиннее 120 знаков. */
export function safeReceiptName(raw: string, ext: string) {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\x00-\x1f<>:"|?*]/g, "").trim().slice(0, 120);
  return clean || `чек.${ext}`;
}

/** Где уже приложен тот же чек (совпал хэш содержимого): платёж заказа или чек сделки. */
export interface ReceiptUse {
  source: "order" | "deal";
  /** Номер заказа или сделки. */
  number: number;
  /** Сумма платежа (у чека сделки без платежа — сумма по чеку, 0 — не указана). */
  amount: number;
  paidAt: Date | null;
  /** Чья покупка: клиент, заказ и сделка этого платежа (у платежа заказа — его заказ, у платежа сделки — её заказ, если есть). */
  clientId?: string | null;
  orderId?: string | null;
  dealId?: string | null;
}

/** Куда прикладывают чек сейчас: заказ (его клиент) или сделка (её клиент и заказ). */
export interface ReceiptTarget {
  clientId: string | null;
  orderId: string | null;
  dealId: string | null;
}

/**
 * Можно ли приложить чек, который уже есть у другого платежа. Один перевод — один платёж той же покупки: тот же заказ или
 * сделка (или сделка этого заказа) — нельзя (так «закрывали» разницу фиктивной доплатой), чужой клиент — нельзя. Можно —
 * у того же клиента к другой сделке или заказу: один перевод за пакет книг, разнесённый по сделкам.
 */
export function receiptReuseAllowed(use: ReceiptUse, target: ReceiptTarget): boolean {
  if (!target.clientId || !use.clientId || use.clientId !== target.clientId) return false;
  const samePurchase = (!!target.orderId && use.orderId === target.orderId) || (!!target.dealId && use.dealId === target.dealId);
  return !samePurchase;
}

/** Чек по содержимому: хэш (hex) и где он уже приложен так, что приложить нельзя. Хэш считает инфраструктура. */
export type ReceiptCheck = (bytes: Uint8Array, target: { orderId?: string | null; dealId?: string | null }) => Promise<{ sha256: string; use: ReceiptUse | null }>;

/** Отказ «этот чек уже приложен…»: к какому платежу, заказа или сделки. */
export function receiptUsedText(u: ReceiptUse) {
  const day = (d: Date) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: storeTimeZone() }).format(d);
  const payment = [u.amount > 0 ? `${u.amount.toLocaleString("ru-RU")} ₸` : null, u.paidAt ? `от ${day(u.paidAt)}` : null].filter(Boolean).join(" ");
  const where = u.source === "order" ? `заказа №${u.number}` : `сделки Д${u.number}`;
  return `Этот чек уже приложен к платежу ${payment ? `${payment} ` : ""}${where}. Один перевод — один платёж: приложите чек именно этой оплаты (один перевод за несколько книг — только по сделкам того же клиента).`;
}
