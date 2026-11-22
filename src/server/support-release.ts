import "server-only";
import { createHash, createHmac } from "node:crypto";
import { safeEqual } from "@/shared/crypto";

/**
 * Ключ, которым выкатка (deploy/support-release.mjs) подписывает запрос «вышел релиз»: HMAC от APP_SECRET — нового
 * секрета заводить не нужно, у скрипта на сервере тот же .env. Формула должна совпадать со скриптом.
 */
export function releaseToken(): string {
  const base = process.env.APP_SECRET || `mybook:${process.env.DATABASE_URL ?? ""}`;
  return createHmac("sha256", createHash("sha256").update(`support-release:${base}`).digest()).update("support-release").digest("hex");
}

export const releaseTokenValid = (token: string | null) => !!token && safeEqual(token, releaseToken());
