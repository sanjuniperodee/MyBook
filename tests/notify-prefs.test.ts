import { describe, expect, it } from "vitest";
import { DEFAULT_NOTIFY_PREFS, inQuietHours, pushAllowed, readNotifyPrefs } from "@/modules/workspace/domain/notifyPrefs";

// Личные настройки push сотрудника (tasks-19, tasks-22). Пояс — Алматы (UTC+5).
const tz = "Asia/Almaty";
const at = (local: string) => new Date(`${local}+05:00`);

describe("тихие часы и push о сообщениях", () => {
  it("по умолчанию — тихие часы 22:00–08:00, push о сообщениях включён; мусор — значения по умолчанию", () => {
    expect(readNotifyPrefs({})).toEqual(DEFAULT_NOTIFY_PREFS);
    expect(readNotifyPrefs({ quiet: "да", quietFrom: "25:00", pushMessages: 1 })).toEqual(DEFAULT_NOTIFY_PREFS);
    expect(readNotifyPrefs({ quiet: false, quietFrom: "23:30", quietTo: "07:00", pushMessages: false })).toEqual({ quiet: false, quietFrom: "23:30", quietTo: "07:00", pushMessages: false });
  });

  it("тихие часы через полночь; выключенные — никогда", () => {
    const p = DEFAULT_NOTIFY_PREFS;
    expect(inQuietHours(p, at("2026-10-01T23:00:00"), tz)).toBe(true);
    expect(inQuietHours(p, at("2026-10-02T07:59:00"), tz)).toBe(true);
    expect(inQuietHours(p, at("2026-10-02T08:00:00"), tz)).toBe(false);
    expect(inQuietHours(p, at("2026-10-01T21:59:00"), tz)).toBe(false);
    expect(inQuietHours({ ...p, quiet: false }, at("2026-10-01T23:00:00"), tz)).toBe(false);
    expect(inQuietHours({ ...p, quietFrom: "13:00", quietTo: "14:00" }, at("2026-10-01T13:30:00"), tz)).toBe(true);
  });

  it("ночью push будит только напоминание о задаче; сообщение клиента — если не выключено", () => {
    const night = at("2026-10-01T23:30:00");
    const day = at("2026-10-01T12:00:00");
    expect(pushAllowed(DEFAULT_NOTIFY_PREFS, "reminder", night, tz)).toBe(true);
    expect(pushAllowed(DEFAULT_NOTIFY_PREFS, "message", night, tz)).toBe(false);
    expect(pushAllowed(DEFAULT_NOTIFY_PREFS, "sla", night, tz)).toBe(false);
    expect(pushAllowed(DEFAULT_NOTIFY_PREFS, "message", day, tz)).toBe(true);
    expect(pushAllowed({ ...DEFAULT_NOTIFY_PREFS, pushMessages: false }, "message", day, tz)).toBe(false);
    expect(pushAllowed({ ...DEFAULT_NOTIFY_PREFS, pushMessages: false }, "deal", day, tz)).toBe(true);
  });
});
