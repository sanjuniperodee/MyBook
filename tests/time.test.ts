import { describe, expect, it } from "vitest";
import { fromZonedTime, storeTimeZone, timeZoneOffset, zonedDay, zonedMonth, zonedParts } from "@/shared/domain/time";
import { isWorkTime, parseWorkHours } from "@/modules/workspace/domain/schedule";
import { isSendingHour } from "@/modules/notifications/domain";
import { currentMonth } from "@/modules/sales/domain";
import { parseKaspiPayment } from "@/modules/ordering/domain";
import { iso, localDay } from "@/modules/reporting/time";
import { storeTimeZoneIs } from "./doubles/time";

const NY = "America/New_York";

describe("часовой пояс магазина: TZ, иначе Алматы", () => {
  describe("TZ не задан", () => {
    storeTimeZoneIs(undefined);

    it("пояс магазина — Алматы", () => {
      expect(storeTimeZone()).toBe("Asia/Almaty");
    });

    it("границы дней отчётов — по Алматы", () => {
      expect(iso(localDay(0))).toBe(zonedDay(new Date(), "Asia/Almaty"));
    });
  });

  describe("TZ задан", () => {
    storeTimeZoneIs(NY);

    it("пояс магазина — из TZ", () => {
      expect(storeTimeZone()).toBe(NY);
    });

    it("по нему считаются часы автописем, рабочее время, месяц плана и дни отчётов", () => {
      const evening = new Date("2026-10-01T18:00:00Z"); // 23:00 в Алматы, 14:00 в Нью-Йорке
      expect(isSendingHour(evening)).toBe(true);
      expect(isWorkTime(evening, parseWorkHours('{"days":[1,2,3,4,5],"from":"09:00","to":"18:00"}'))).toBe(true);
      expect(currentMonth(new Date("2026-10-31T20:00:00Z"))).toBe("2026-10"); // в Алматы уже ноябрь
      expect(iso(localDay(0))).toBe(zonedDay(new Date(), NY));
    });

    it("даты Kaspi без зоны — по-прежнему время Казахстана", () => {
      const qr = parseKaspiPayment({ Data: { QrOperationId: 1, ExpireDate: "2026-10-13T12:05:00" } });
      expect(qr!.expiresAt!.toISOString()).toBe("2026-10-13T07:05:00.000Z");
    });
  });
});

describe("местное время в поясе", () => {
  const at = new Date("2026-10-31T20:30:00Z");

  it("части, день и месяц", () => {
    expect(zonedParts(at, "Asia/Almaty")).toEqual({ y: 2026, m: 11, d: 1, weekday: 7, minutes: 90 });
    expect(zonedDay(at, "Asia/Almaty")).toBe("2026-11-01");
    expect(zonedMonth(at, "Asia/Almaty")).toBe("2026-11");
    expect(zonedDay(at, NY)).toBe("2026-10-31");
    expect(zonedMonth(at, NY)).toBe("2026-10");
  });

  it("смещение от UTC — с летним временем", () => {
    expect(timeZoneOffset(at, "Asia/Almaty")).toBe(300);
    expect(timeZoneOffset(new Date("2026-07-01T12:00:00Z"), NY)).toBe(-240);
    expect(timeZoneOffset(new Date("2026-01-15T12:00:00Z"), NY)).toBe(-300);
  });

  it("момент по местному времени без зоны", () => {
    expect(fromZonedTime("2026-10-13T12:05:00", "Asia/Almaty").toISOString()).toBe("2026-10-13T07:05:00.000Z");
    expect(fromZonedTime("2026-10-13T12:00:00", NY).toISOString()).toBe("2026-10-13T16:00:00.000Z");
    expect(fromZonedTime("2026-01-15T12:00:00", NY).toISOString()).toBe("2026-01-15T17:00:00.000Z");
    // Сразу после перевода часов (8 марта, 02:00 → 03:00) — уже летнее смещение.
    expect(fromZonedTime("2026-03-08T03:30:00", NY).toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });

  it("строка со своей зоной — как есть; не дата — Invalid Date", () => {
    expect(fromZonedTime("2026-10-13T12:05:00Z", NY).toISOString()).toBe("2026-10-13T12:05:00.000Z");
    expect(fromZonedTime("2026-10-13T12:05:00+06:00", NY).toISOString()).toBe("2026-10-13T06:05:00.000Z");
    expect(Number.isNaN(fromZonedTime("мусор", NY).getTime())).toBe(true);
  });
});
