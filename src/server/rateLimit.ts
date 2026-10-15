import { headers } from "next/headers";
import type { RequestOrigin } from "@/modules/access";

/**
 * Ограничение частоты через порт RateLimiter: Redis при REDIS_URL (общий для всех экземпляров),
 * иначе память процесса.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const { container } = await import("@/server/container");
  return container().rateLimiter.hit(key, limit, windowMs);
}

/**
 * Адрес клиента — для лимитов частоты, списка разрешённых IP и журнала. Первый адрес в X-Forwarded-For клиент может
 * подставить сам, поэтому берём X-Real-IP от своего прокси, а без него — последний адрес цепочки
 * (его добавил ближайший к приложению прокси). Решение 2 (V2): других способов узнать адрес нет.
 */
export async function trustedClientIp(): Promise<string> {
  const h = await headers();
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const chain = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return chain.at(-1) || "local";
}

/** Адрес запроса для журнала действий Access; вне запроса (планировщик, скрипт) headers() бросает — адреса нет. */
export const requestOrigin: RequestOrigin = { ip: () => trustedClientIp().catch(() => null) };
