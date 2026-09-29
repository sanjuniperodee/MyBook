import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/** Проверка подписи уведомлений CloudPayments: base64(HMAC-SHA256(тело запроса, API Secret)). */
export function verifyCloudPaymentsSignature(rawBody: string, signature: string | null): boolean {
  if (!signature || !env.cloudpayments.apiSecret) return false;
  const expected = createHmac("sha256", env.cloudpayments.apiSecret).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isOnlinePayment() {
  return env.paymentProvider === "cloudpayments" && !!env.cloudpayments.publicId;
}
