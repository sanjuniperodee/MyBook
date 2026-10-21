import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ set: [] as [string, boolean][], audit: [] as string[], routing: 0, hours: JSON.stringify({ days: [1, 2, 3, 4, 5, 6, 7], from: "09:00", to: "21:00" }) }));

vi.mock("@/server/container", () => ({
  container: () => ({
    access: { shifts: { set: async (id: string, on: boolean) => void calls.set.push([id, on]) } },
    sales: { routing: { run: async () => void calls.routing++ } },
  }),
}));
vi.mock("@/server/access", () => ({
  audit: async (_s: unknown, action: string) => void calls.audit.push(action),
  can: (s: { perms: string[] }, ...p: string[]) => p.some((x) => s.perms.includes(x)),
}));
vi.mock("@/modules/workspace", () => ({ getSetting: async () => calls.hours }));

import { autoShiftOnVisit } from "@/server/shift";

const staff = (o: Partial<{ onShift: boolean; lastSeenAt: Date | null; perms: string[] }> = {}) =>
  ({ user: { id: "u1", onShift: o.onShift ?? false, lastSeenAt: o.lastSeenAt === undefined ? null : o.lastSeenAt }, perms: o.perms ?? ["chats.send"] }) as never;

// 14:00 по Алматы (UTC+5) — рабочее время; 02:00 — нерабочее.
const day = new Date("2026-10-21T09:00:00Z");
const night = new Date("2026-10-20T21:00:00Z");

beforeEach(() => {
  calls.set.length = 0;
  calls.audit.length = 0;
  calls.routing = 0;
});

describe("Автоматически «в сети» при заходе в рабочее время", () => {
  it("новый заход в рабочее время — выходит на смену, заявки раздаются сразу, действие в журнале", async () => {
    expect(await autoShiftOnVisit(staff({ lastSeenAt: new Date(day.getTime() - 3 * 3600_000) }), day)).toBe(true);
    expect(calls.set).toEqual([["u1", true]]);
    expect(calls.audit).toEqual(["staff.shift_auto_on"]);
    expect(calls.routing).toBe(1);
  });

  it("первый заход (раньше не заходил) — тоже", async () => {
    expect(await autoShiftOnVisit(staff({ lastSeenAt: null }), day)).toBe(true);
  });

  it("вне рабочего времени — не включаем", async () => {
    expect(await autoShiftOnVisit(staff({ lastSeenAt: null }), night)).toBe(false);
    expect(calls.set).toEqual([]);
  });

  it("сам ушёл со смены и работает дальше (заходил меньше 10 минут назад) — остаётся не в сети", async () => {
    expect(await autoShiftOnVisit(staff({ lastSeenAt: new Date(day.getTime() - 4 * 60_000) }), day)).toBe(false);
    expect(calls.set).toEqual([]);
  });

  it("уже на смене — ничего не делаем", async () => {
    expect(await autoShiftOnVisit(staff({ onShift: true }), day)).toBe(true);
    expect(calls.set).toEqual([]);
  });

  it("без прав на сделки и чаты (переключателя смены нет) — не включаем", async () => {
    expect(await autoShiftOnVisit(staff({ perms: ["orders.view"] }), day)).toBe(false);
    expect(calls.set).toEqual([]);
  });

  it("выходной день по графику — не включаем", async () => {
    calls.hours = JSON.stringify({ days: [1, 2, 3, 4, 5], from: "09:00", to: "21:00" });
    expect(await autoShiftOnVisit(staff(), new Date("2026-10-24T09:00:00Z"))).toBe(false); // суббота
    calls.hours = JSON.stringify({ days: [1, 2, 3, 4, 5, 6, 7], from: "09:00", to: "21:00" });
  });
});
