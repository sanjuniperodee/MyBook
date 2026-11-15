import { describe, expect, it } from "vitest";
import { dealAdvancedFilters, dealDatePresets } from "@/modules/reporting/ui/dealFilters";

const tz = "Asia/Almaty";

describe("Панель «Фильтр» сделок", () => {
  it("период — по времени магазина, границы [from, to); поле даты по умолчанию — создание", () => {
    const f = dealAdvancedFilters({ from: "2026-11-01", to: "2026-11-14" }, tz);
    expect(f).toMatchObject({ field: "created", fromDay: "2026-11-01", toDay: "2026-11-14", count: 1 });
    expect(f.from?.toISOString()).toBe("2026-10-31T19:00:00.000Z");
    expect(f.to?.toISOString()).toBe("2026-11-14T19:00:00.000Z");
    expect(dealAdvancedFilters({ df: "closed", from: "2026-11-05" }, tz)).toMatchObject({ field: "closed", fromDay: "2026-11-05", toDay: null, to: null });
    expect(dealAdvancedFilters({ df: "мусор" }, tz).field).toBe("created");
  });

  it("перепутанные даты и бюджет меняются местами; мусор отбрасывается", () => {
    expect(dealAdvancedFilters({ from: "2026-11-14", to: "2026-11-01" }, tz)).toMatchObject({ fromDay: "2026-11-01", toDay: "2026-11-14" });
    expect(dealAdvancedFilters({ min: "34 000", max: "29000" }, tz)).toMatchObject({ min: 29000, max: 34000, count: 1 });
    expect(dealAdvancedFilters({ from: "2026-02-31", to: "вчера", min: "-5", st: "не uuid", paid: "может быть" }, tz)).toMatchObject({ fromDay: null, toDay: null, min: null, stageId: null, paid: null, count: 0 });
  });

  it("этап, оплата, причина отказа и тег; счётчик на кнопке — по числу включённых фильтров", () => {
    const f = dealAdvancedFilters({ st: "cc89f4a9-9b56-4f04-a1d1-4a569b1094dd", paid: "no", lr: " Дорого ", tag: "vip", from: "2026-11-01", min: "10000" }, tz);
    expect(f).toMatchObject({ stageId: "cc89f4a9-9b56-4f04-a1d1-4a569b1094dd", paid: "no", lostReason: "Дорого", tag: "vip", count: 6 });
    expect(dealAdvancedFilters({}, tz).count).toBe(0);
  });

  it("готовые периоды: сегодня, вчера, 7 и 30 дней, этот и прошлый месяц", () => {
    expect(dealDatePresets("2026-11-16").map((p) => [p.key, p.from, p.to])).toEqual([
      ["today", "2026-11-16", "2026-11-16"],
      ["yesterday", "2026-11-15", "2026-11-15"],
      ["7d", "2026-11-10", "2026-11-16"],
      ["30d", "2026-10-18", "2026-11-16"],
      ["month", "2026-11-01", "2026-11-16"],
      ["prev", "2026-10-01", "2026-10-31"],
    ]);
    expect(dealDatePresets("2026-03-01")[5]).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
  });
});
