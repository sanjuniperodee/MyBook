import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Locale } from "@/i18n/config";
import { appLink } from "@/shared/infrastructure/mail";
import type { UnsubscribeLinks } from "../application";

function secret() {
  return process.env.APP_SECRET || createHash("sha256").update(`mybook:${process.env.DATABASE_URL ?? ""}`).digest("hex");
}

/** Совместимо с уже отправленными письмами: HMAC(APP_SECRET, "unsub:<id>"), 32 символа base64url. */
export function unsubscribeToken(userId: string) {
  return createHmac("sha256", secret()).update(`unsub:${userId}`).digest("base64url").slice(0, 32);
}

export function unsubscribeUrl(userId: string, locale: Locale = "ru") {
  return appLink(`/unsubscribe?u=${userId}&t=${unsubscribeToken(userId)}`, locale);
}

export const hmacUnsubscribeLinks: UnsubscribeLinks = {
  verify(userId, token) {
    const a = Buffer.from(unsubscribeToken(userId));
    const b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
  },
};
