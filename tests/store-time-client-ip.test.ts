// Перенесено обратно из mybook-web (27.11): здесь — проверки общего кода и домена; экраны — в тестах веба.
import { afterEach, describe, expect, it, vi } from "vitest";
const migrate = vi.fn(async () => {});
vi.mock("@/shared/infrastructure/db/migrate", () => ({ runMigrations: migrate }));

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

describe("границы дня магазина не зависят от пояса процесса", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("localDay/iso/dayStart: процесс в UTC, магазин в Алматы", async () => {
    vi.stubEnv("TZ", "UTC");
    vi.stubEnv("STORE_TIME_ZONE", "Asia/Almaty");
    const { dayStart, iso, localDay } = await import("@/modules/reporting/ui/time");
    const today = localDay(0);
    expect(iso(today)).toBe(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(new Date()));
    expect(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Almaty", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(today)).toBe("00:00");
    expect(localDay(1).getTime() - today.getTime()).toBe(86_400_000);
    expect(dayStart("2026-11-27").toISOString()).toBe("2026-11-26T19:00:00.000Z");
  });
});

describe("IP клиента от фронта на Vercel (src/shared/clientIp.ts)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("подпись общим секретом: верная и свежая — верим, чужая, старая или без секрета — нет", async () => {
    const { signClientIp, verifyClientIp } = await import("@/shared/clientIp");
    const now = Date.now();
    const sig = signClientIp("10.1.2.3", "s3cret", now);
    expect(verifyClientIp("10.1.2.3", sig, "s3cret", now)).toBe(true);
    expect(verifyClientIp("10.1.2.4", sig, "s3cret", now)).toBe(false);
    expect(verifyClientIp("10.1.2.3", sig, "other", now)).toBe(false);
    expect(verifyClientIp("10.1.2.3", sig, "s3cret", now + 10 * 60_000)).toBe(false);
    expect(verifyClientIp("10.1.2.3", sig, undefined, now)).toBe(false);
  });
});
