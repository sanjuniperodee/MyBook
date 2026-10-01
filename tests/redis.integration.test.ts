import { afterAll, describe, expect, it } from "vitest";
import Redis from "ioredis";
import { MemoryRateLimiter, MemoryStepStore, RedisRateLimiter, RedisStepStore } from "@/shared/infrastructure/redis";

/** Адаптеры Redis на настоящем сервере: REDIS_TEST_URL=redis://localhost:6390 npx vitest run tests/redis.integration.test.ts */
const url = process.env.REDIS_TEST_URL;
const run = url ? describe : describe.skip;

describe("лимиты и шаги TOTP в памяти", () => {
  it("фиксированное окно и монотонные шаги", async () => {
    const rl = new MemoryRateLimiter();
    expect([await rl.hit("k", 2, 60_000), await rl.hit("k", 2, 60_000), await rl.hit("k", 2, 60_000)]).toEqual([true, true, false]);
    const steps = new MemoryStepStore();
    expect([await steps.advance("u", 10), await steps.advance("u", 10), await steps.advance("u", 9), await steps.advance("u", 11)]).toEqual([true, false, false, true]);
  });
});

run("Redis", () => {
  const redis = new Redis(url!);
  const prefix = `t${Date.now()}`;
  afterAll(() => redis.quit());

  it("лимит общий для всех экземпляров приложения", async () => {
    const a = new RedisRateLimiter(redis);
    const b = new RedisRateLimiter(new Redis(url!));
    expect(await a.hit(`${prefix}:login`, 2, 60_000)).toBe(true);
    expect(await b.hit(`${prefix}:login`, 2, 60_000)).toBe(true);
    expect(await a.hit(`${prefix}:login`, 2, 60_000)).toBe(false);
    expect(await redis.pttl(`rl:${prefix}:login`)).toBeGreaterThan(0);
  });

  it("код TOTP нельзя использовать повторно ни на одном экземпляре", async () => {
    const a = new RedisStepStore(redis);
    const b = new RedisStepStore(new Redis(url!));
    expect(await a.advance(`${prefix}-u`, 100)).toBe(true);
    expect(await b.advance(`${prefix}-u`, 100)).toBe(false);
    expect(await b.advance(`${prefix}-u`, 99)).toBe(false);
    expect(await b.advance(`${prefix}-u`, 101)).toBe(true);
  });

  it("Redis недоступен — запасной вариант в памяти, запросы не падают", async () => {
    const dead = new Redis("redis://127.0.0.1:1", { maxRetriesPerRequest: 0, enableOfflineQueue: false, lazyConnect: true, retryStrategy: () => null });
    dead.on("error", () => {});
    const rl = new RedisRateLimiter(dead);
    expect(await rl.hit("x", 1, 1000)).toBe(true);
    expect(await rl.hit("x", 1, 1000)).toBe(false);
    expect(await new RedisStepStore(dead).advance("u", 1)).toBe(true);
    dead.disconnect();
  });
});
