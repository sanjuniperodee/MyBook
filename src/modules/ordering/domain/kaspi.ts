import { normalizePhone } from "@/shared/domain/phone";

/**
 * Протокол kaspi-pos-automation (github.com/tapter-dev/kaspi-pos-automation): статусы Kaspi Pay, вебхуки
 * и ответы о счёте. Чистые функции — сеть и подпись в infrastructure/payments.
 */

/** Чем платит клиент: счёт в приложение Kaspi по номеру телефона или QR-код. */
export type KaspiMethod = "invoice" | "qr";

/** Итог платежа в нашем словаре: платёж прошёл, отклонён, отменён клиентом, истёк или ещё ждёт. */
export type KaspiOutcome = "paid" | "failed" | "cancelled" | "expired" | "pending";

const PAID = new Set(["processed", "paid", "success", "succeeded"]);
const CANCELLED = new Set(["cancelledbyuser", "cancelledbyexternalsource", "remotepaymentcanceled", "cancelled", "canceled"]);
const EXPIRED = new Set(["expired", "qrtokendiscarded", "qertokendiscarded", "sessionexpired"]);
const FAILED = new Set(["notconfirmedbyuser", "processingfailed", "rejected", "insufficientfunds", "insufficientfundserror", "error", "remotepaymentrejected", "failed"]);

/** Статус Kaspi («Processed», «RemotePaymentCanceled»…) → итог. Незнакомый статус — платёж ещё ждёт. */
export function kaspiOutcome(status: string | null | undefined): KaspiOutcome {
  const s = String(status ?? "").trim().toLowerCase();
  if (PAID.has(s)) return "paid";
  if (CANCELLED.has(s)) return "cancelled";
  if (EXPIRED.has(s)) return "expired";
  if (FAILED.has(s)) return "failed";
  return "pending";
}

/** Номер для счёта Kaspi: казахстанский мобильный (коды 70x, 747, 75x, 76x, 77x; городские 71x–72x не подходят). null — номер не подходит. */
export function kaspiPhone(raw: string | null | undefined): string | null {
  const d = normalizePhone(raw);
  return /^7(?:70\d|747|7[567]\d)\d{7}$/.test(d) ? d : null;
}

/** Что известно о платеже из ответа kaspi-pos (создание, детали счёта, статус QR) или из вебхука. */
export interface KaspiPaymentView {
  externalId: string;
  status: string;
  amount: number | null;
  /** Ссылка на оплату или чек (QR — ссылка pay.kaspi.kz, счёт — чек). */
  checkoutUrl: string | null;
  /** Содержимое QR-кода (ссылка на оплату). */
  qrToken: string | null;
  expiresAt: Date | null;
}

const record = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function text(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function money(...values: unknown[]): number | null {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim()) {
      const n = Number(v.replace(/[^\d.,-]/g, "").replace(",", "."));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/** Даты Kaspi приходят без зоны («2026-10-13T12:05:00») — это время Алматы (UTC+5). */
function kaspiDate(raw: string | null): Date | null {
  if (!raw) return null;
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}+05:00`;
  const d = new Date(withZone);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Ответ kaspi-pos: `{ StatusCode, Data: { Id | QrOperationId, Status, Amount, ReceiptUrl, QrToken, ExpireDate } }`
 * (у разных версий поля в разном регистре). null — в ответе нет идентификатора платежа.
 */
export function parseKaspiPayment(body: unknown, fallbackId?: string): KaspiPaymentView | null {
  const root = record(body);
  const data = record(root?.Data) ?? record(root?.data) ?? root;
  if (!data) return null;
  const externalId = text(data.Id, data.id, data.QrOperationId, data.qrOperationId, data.OperationId, data.operationId, root?.paymentId) ?? fallbackId ?? null;
  if (!externalId) return null;
  const qrToken = text(data.QrToken, data.qrToken);
  return {
    externalId,
    status: text(data.Status, data.status) ?? "",
    amount: money(data.Amount, data.amount, data.TotalAmount, data.totalAmount),
    checkoutUrl: text(qrToken, data.PaymentUrl, data.paymentUrl, data.ReceiptUrl, data.receiptUrl, data.CheckoutUrl, data.checkoutUrl),
    qrToken,
    expiresAt: kaspiDate(text(data.ExpireDate, data.expireDate, data.ExpiresAt, data.expiresAt)),
  };
}

/** Ошибка создания платежа в kaspi-pos: `StatusCode` не 0. */
export function kaspiStatusCode(body: unknown): number {
  const root = record(body);
  return Number(root?.StatusCode ?? root?.statusCode ?? 0);
}

export interface KaspiWebhook {
  event: "payment.success" | "payment.failed" | "payment.expired" | "payment.lost";
  externalId: string;
  method: KaspiMethod;
  status: string;
  amount: number | null;
}

const EVENTS = new Set<KaspiWebhook["event"]>(["payment.success", "payment.failed", "payment.expired", "payment.lost"]);

/** Тело вебхука kaspi-pos: `{ event, paymentId, type, status, amount, … }`. null — не наш формат. */
export function parseKaspiWebhook(body: unknown): KaspiWebhook | null {
  const root = record(body);
  const event = String(root?.event ?? "") as KaspiWebhook["event"];
  const externalId = text(root?.paymentId);
  if (!root || !EVENTS.has(event) || !externalId) return null;
  return { event, externalId, method: root.type === "qr" ? "qr" : "invoice", status: text(root.status) ?? "", amount: money(root.amount) };
}
