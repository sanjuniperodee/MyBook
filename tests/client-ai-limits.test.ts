import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRateLimiter } from "@/shared/infrastructure/redis";

const w = vi.hoisted(() => ({
  stored: {} as Record<string, string>,
  limiter: null as unknown as InstanceType<
    typeof import("@/shared/infrastructure/redis").MemoryRateLimiter
  >,
}));

vi.mock("@/modules/workspace", () => ({
  getSetting: async (k: string) => w.stored[k] ?? "",
  getSettings: async (keys: string[]) =>
    Object.fromEntries(keys.map((k) => [k, w.stored[k] ?? ""])),
  saveSettings: async (values: Record<string, string>) => {
    for (const [k, v] of Object.entries(values))
      if (v === "") delete w.stored[k];
      else w.stored[k] = v;
  },
}));
vi.mock("@/server/container", () => ({
  container: () => ({ rateLimiter: w.limiter }),
}));
vi.mock("@/server/rateLimit", () => ({
  rateLimit: (key: string, limit: number, ms: number) =>
    w.limiter.hit(key, limit, ms),
}));

const lim = await import("@/server/clientAiLimits");
const U = "11111111-2222-3333-4444-555555555555";

beforeEach(() => {
  w.stored = {};
  w.limiter = new MemoryRateLimiter();
});

describe("лимиты AI у клиента", () => {
  it("по умолчанию — 10 минут и сутки, прежние числа; битые значения — по умолчанию", async () => {
    w.stored["writer.perTenMin"] = "много";
    const l = await lim.clientAiLimits();
    expect(l.writer).toEqual({
      short: 10,
      shortMin: 10,
      long: 60,
      longHours: 24,
    });
    expect(l.proofread).toEqual({
      short: 10,
      shortMin: 10,
      long: 80,
      longHours: 24,
    });
    expect(l.help).toEqual({
      short: 20,
      shortMin: 10,
      long: 60,
      longHours: 24,
    });
  });

  it("окно в час: лимит короткого окна, затем «short»; потраченное видно и обнуляется", async () => {
    await lim.saveClientAiLimits(
      {
        ...(await lim.clientAiLimits()),
        writer: { short: 2, shortMin: 60, long: 5, longHours: 24 },
      },
      "staff",
    );
    expect(w.stored["writer.windowMin"]).toBe("60");
    expect(await lim.hitClientAi("writer", U)).toBe("ok");
    expect(await lim.hitClientAi("writer", U)).toBe("ok");
    expect(await lim.hitClientAi("writer", U)).toBe("short");
    const u = await lim.clientAiUsage(U);
    expect(u.writer.short.used).toBe(2);
    expect(u.writer.short.resetAt! - Date.now()).toBeGreaterThan(59 * 60_000);
    expect(u.proofread.short).toEqual({ used: 0, resetAt: null });
    await lim.resetClientAiUsage(U, "writer");
    expect(await lim.hitClientAi("writer", U)).toBe("ok");
  });

  it("свои лимиты клиента заменяют общие только у него; 0 — закрыт; без чисел — снова общие", async () => {
    await lim.saveUserAiOverride(
      U,
      { proofread: { long: 1 }, help: { short: 0 } },
      "попросила",
      "staff",
    );
    const own = await lim.clientAiLimitsFor(U);
    expect(own.proofread).toMatchObject({
      short: 10,
      long: 1,
      customShort: false,
      customLong: true,
    });
    expect(await lim.hitClientAi("proofread", U)).toBe("ok");
    expect(await lim.hitClientAi("proofread", U)).toBe("long");
    expect(await lim.hitClientAi("help", U)).toBe("short");
    const other = "99999999-2222-3333-4444-555555555555";
    expect(await lim.hitClientAi("help", other)).toBe("ok");
    expect((await lim.userAiOverrides())[U].note).toBe("попросила");
    await lim.saveUserAiOverride(U, {}, "", "staff");
    expect(await lim.userAiOverrides()).toEqual({});
  });

  it("битая запись своих лимитов не ломает общие", async () => {
    w.stored["ai.userLimits"] = "{не json";
    expect(await lim.userAiOverrides()).toEqual({});
    w.stored["ai.userLimits"] = JSON.stringify({
      "не-id": { tools: { writer: { short: 5 } } },
      [U]: { tools: { writer: { short: "x" } } },
    });
    expect(await lim.userAiOverrides()).toEqual({});
  });
});
