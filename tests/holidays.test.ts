import { describe, expect, it } from "vitest";
import { DEFAULT_HOLIDAYS, HOLIDAYS_MAX, holidayIdFor, holidayWindows, holidaysError, isHolidayDate, parseHolidays, upcomingHolidays, type Holiday } from "@/modules/automation/domain";
import { draftFromNote, draftNote, whatsappLink } from "@/shared/domain/templates";

describe("праздники для повторных продаж (bots-10)", () => {
  it("ближайшие праздники в пределах N дней, через Новый год — уже следующего года; прошлогодняя дата — для покупок", () => {
    expect(upcomingHolidays(DEFAULT_HOLIDAYS, "2026-12-20", 60).map((u) => [u.holiday.id, u.date, u.inDays, u.lastYear])).toEqual([
      ["newyear", "2026-12-31", 11, "2025-12-31"],
      ["valentine", "2027-02-14", 56, "2026-02-14"],
    ]);
    // В сам день праздника — ещё да, на следующий — уже через год.
    expect(upcomingHolidays(DEFAULT_HOLIDAYS, "2027-03-08", 0).map((u) => u.date)).toEqual(["2027-03-08"]);
    expect(upcomingHolidays(DEFAULT_HOLIDAYS, "2027-03-09", 30)).toEqual([]);
    expect(upcomingHolidays(DEFAULT_HOLIDAYS, "2026-12-20", 60, "valentine").map((u) => u.holiday.id)).toEqual(["valentine"]);
  });

  it("окна покупок: прошлогоднее — N дней до даты год назад включительно; «уже купил в этом сезоне» — с даты − (за сколько дней + окно)", () => {
    const [ny] = upcomingHolidays(DEFAULT_HOLIDAYS, "2026-12-01", 30);
    expect(holidayWindows(ny, 30, 30)).toEqual({ from: "2025-12-01", to: "2025-12-31", seasonFrom: "2026-11-01" });
    const [feb] = upcomingHolidays(DEFAULT_HOLIDAYS, "2027-02-01", 30);
    expect(holidayWindows(feb, 14, 30)).toEqual({ from: "2026-01-31", to: "2026-02-14", seasonFrom: "2027-01-01" });
  });

  it("список из настройки: пусто или испорчено — по умолчанию, «[]» — праздников нет; 29 февраля, повтор даты и пустая подпись — ошибка", () => {
    expect(parseHolidays("")).toEqual(DEFAULT_HOLIDAYS);
    expect(parseHolidays("{не json")).toEqual(DEFAULT_HOLIDAYS);
    expect(parseHolidays("[]")).toEqual([]);
    const nauryz: Holiday = { id: holidayIdFor("03-21"), date: "03-21", ru: "Наурыз", kk: "Наурыз мейрамы" };
    expect(parseHolidays(JSON.stringify([nauryz]))).toEqual([{ id: "h0321", date: "03-21", ru: "Наурыз", kk: "Наурыз мейрамы" }]);
    expect(isHolidayDate("02-29")).toBe(false);
    expect(isHolidayDate("04-31")).toBe(false);
    expect(isHolidayDate("12-31")).toBe(true);
    expect(holidaysError([{ ...nauryz, date: "02-29" }])).toBe("holidayDateInvalid");
    expect(holidaysError([{ ...nauryz, kk: " " }])).toBe("holidayNameMissing");
    expect(holidaysError([nauryz, { ...nauryz, id: "other" }])).toBe("holidayDuplicate");
    expect(holidaysError(Array.from({ length: HOLIDAYS_MAX + 1 }, (_, i) => ({ ...nauryz, id: `h${i}` })))).toBe("holidaysTooMany");
    expect(holidaysError([...DEFAULT_HOLIDAYS])).toBeNull();
  });
});

describe("готовый текст клиенту в истории сделки", () => {
  it("заметка правила узнаётся, текст — со второй строки; обычная заметка — нет", () => {
    const note = draftNote("Праздник → повторная продажа", "Айгерим, Новый год — 31 декабря 2026 г.\nПодготовим новую книгу?");
    expect(draftFromNote(note)).toBe("Айгерим, Новый год — 31 декабря 2026 г.\nПодготовим новую книгу?");
    expect(draftFromNote("Клиент просил перезвонить")).toBeNull();
  });

  it("wa.me: с номером — сразу в чат клиента, без номера — WhatsApp спросит, кому", () => {
    expect(whatsappLink("Сәлем! 8 наурыз", "77011234567")).toBe("https://wa.me/77011234567?text=%D0%A1%D3%99%D0%BB%D0%B5%D0%BC!%208%20%D0%BD%D0%B0%D1%83%D1%80%D1%8B%D0%B7");
    expect(whatsappLink("Привет", null)).toBe("https://wa.me/?text=%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82");
  });
});
