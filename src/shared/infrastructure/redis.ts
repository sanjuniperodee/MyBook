import "server-only";
import Redis from "ioredis";
import type { OneTimeStepStore, RateLimiter } from "../application/RateLimiter";

/**
 * Redis — опционально (REDIS_URL). Нужен, когда приложение работает в нескольких экземплярах
 * (PM2 cluster, несколько контейнеров): лимиты и защита кодов 2FA должны быть общими.
 * На одном процессе хватает памяти, и без Redis всё работает так же.
 */
let client: Redis | null | undefined;

export function redisClient(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.REDIS_URL;
  if (!url) return (client = null);
  client = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false, connectTimeout: 3000 });
  client.on("error", (err) => console.error("[redis]", err.message));
  return client;
}

export async function redisHealthy(): Promise<boolean | null> {
  const r = redisClient();
  if (!r) return null;
  try {
    if (r.status !== "ready") await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("redis not ready")), 2000);
      r.once("ready", () => (clearTimeout(t), resolve()));
    });
    return (await r.ping()) === "PONG";
  } catch {
    return false;
  }
}

// ─── в памяти процесса ─────────────────────────────────────────────────────

type Bucket = { count: number; resetAt: number };

export class MemoryRateLimiter implements RateLimiter {
  readonly #buckets = new Map<string, Bucket>();

  async hit(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    const b = this.#buckets.get(key);
    if (!b || b.resetAt < now) {
      this.#buckets.set(key, { count: 1, resetAt: now + windowMs });
      if (this.#buckets.size > 10_000) for (const [k, v] of this.#buckets) if (v.resetAt < now) this.#buckets.delete(k);
      return true;
    }
    b.count += 1;
    return b.count <= limit;
  }
}

export class MemoryStepStore implements OneTimeStepStore {
  readonly #last = new Map<string, number>();

  async advance(userId: string, step: number) {
    if ((this.#last.get(userId) ?? -1) >= step) return false;
    this.#last.set(userId, step);
    return true;
  }
}

// ─── Redis ────────────────────────────────────────────────────────────────

/** Фиксированное окно: INCR + PEXPIRE при первом попадании. При недоступности Redis — запасной лимитер в памяти. */
export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly fallback: RateLimiter = new MemoryRateLimiter(),
  ) {}

  async hit(key: string, limit: number, windowMs: number) {
    try {
      const k = `rl:${key}`;
      const [[, count]] = (await this.redis.multi().incr(k).pexpire(k, windowMs, "NX").exec()) as [[Error | null, number]];
      return count <= limit;
    } catch {
      return this.fallback.hit(key, limit, windowMs);
    }
  }
}

const ADVANCE_LUA = `local cur = tonumber(redis.call('GET', KEYS[1]) or '-1')
if cur >= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'PX', 300000)
return 1`;

export class RedisStepStore implements OneTimeStepStore {
  constructor(
    private readonly redis: Redis,
    private readonly fallback: OneTimeStepStore = new MemoryStepStore(),
  ) {}

  async advance(userId: string, step: number) {
    try {
      return (await this.redis.eval(ADVANCE_LUA, 1, `totp:last:${userId}`, String(step))) === 1;
    } catch {
      return this.fallback.advance(userId, step);
    }
  }
}

export function createRateLimiter(): RateLimiter {
  const r = redisClient();
  return r ? new RedisRateLimiter(r) : new MemoryRateLimiter();
}

export function createStepStore(): OneTimeStepStore {
  const r = redisClient();
  return r ? new RedisStepStore(r) : new MemoryStepStore();
}
