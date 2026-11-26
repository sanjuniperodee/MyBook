import { headers } from "next/headers";
import type { RequestOrigin } from "@/modules/access";
import { clientIpFrom } from "@/shared/clientIp";

/**
 * Ограничение частоты через порт RateLimiter: Redis при REDIS_URL (общий для всех экземпляров),
 * иначе память процесса.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const { container } = await import("@/server/container");
  return container().rateLimiter.hit(key, limit, windowMs);
}

/** Адрес клиента текущего запроса (правило — clientIpFrom в src/shared/clientIp.ts). */
export async function trustedClientIp(): Promise<string> {
  const h = await headers();
  return clientIpFrom((name) => h.get(name), process.env.EDGE_IP_SECRET);
}

/** Адрес запроса для журнала действий Access; вне запроса (планировщик, скрипт) headers() бросает — адреса нет. */
export const requestOrigin: RequestOrigin = { ip: () => trustedClientIp().catch(() => null) };
