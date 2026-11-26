import { afterEach, describe, expect, it, vi } from "vitest";

const migrate = vi.fn(async () => {});
vi.mock("@/shared/infrastructure/db/migrate", () => ({ runMigrations: migrate }));

describe("запуск сайта без БД (Vercel, ADR 0012 A5)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("без DATABASE_URL — ни миграций, ни фона: сайт только показывает страницы через API v1", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("WEB_API_ONLY", "");
    const { registerNode } = await import("@/instrumentation-node");
    await registerNode();
    vi.stubEnv("DATABASE_URL", "postgres://db/mybook");
    vi.stubEnv("WEB_API_ONLY", "1");
    await registerNode();
    expect(migrate).not.toHaveBeenCalled();
  });
});

describe("пояс магазина на Vercel", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("STORE_TIME_ZONE важнее TZ; «:UTC» из POSIX-записи читается как UTC", async () => {
    const { storeTimeZone } = await import("@/shared/domain/time");
    vi.stubEnv("STORE_TIME_ZONE", "");
    vi.stubEnv("TZ", ":UTC");
    expect(storeTimeZone()).toBe("UTC");
    vi.stubEnv("STORE_TIME_ZONE", "Asia/Almaty");
    expect(storeTimeZone()).toBe("Asia/Almaty");
    expect(() => new Intl.DateTimeFormat("ru-RU", { timeZone: storeTimeZone() })).not.toThrow();
  });
});
