import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Сохранение правила автоматизации (saveAutomationAction): ошибки условий — по-русски из словаря admin, а не текст zod
 * по умолчанию; стёртое поле порога («») — понятная ошибка, а не тихий 0. Права, контейнер и журнал подменены.
 */
const w = vi.hoisted(() => ({ saved: [] as unknown[] }));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/access", () => ({ assertStaff: async () => ({ user: { id: "boss" } }), audit: async () => {} }));
vi.mock("@/server/container", () => ({ container: () => ({ automation: { rules: { save: async (r: unknown) => void w.saved.push(r) } } }) }));

const { saveAutomationAction } = await import("@/app/admin/automations/actions");
const { admin } = await import("@/i18n/admin");

const task = [{ type: "create_task" as const, title: "Связаться", dueMinutes: 120 }];
const save = (trigger: string, conditions: Record<string, unknown>) => saveAutomationAction({ name: "Правило", trigger: trigger as "deal.event_date_near", conditions: conditions as never, actions: task, active: false });

beforeEach(() => void (w.saved = []));

describe("правило автоматизации: тексты ошибок условий", () => {
  it("за сколько дней: пусто, 0 и больше 120 — по-русски; «Успеть к дате» — не больше 60", async () => {
    for (const daysBefore of ["", 0, 121]) expect(await save("occasion.anniversary", { daysBefore })).toEqual({ ok: false, message: admin.daysBeforeInvalid(120) });
    expect(await save("deal.event_date_near", { daysBefore: 61 })).toEqual({ ok: false, message: admin.eventDateDaysInvalid(60) });
    expect(await save("deal.event_date_near", { daysBefore: "10" })).toEqual({ ok: true, message: "Правило сохранено" });
    expect(w.saved).toEqual([expect.objectContaining({ conditions: { daysBefore: 10 } })]);
  });

  it("«клиенту не ответили N минут»: пусто и больше суток — по-русски", async () => {
    for (const minutes of ["", 1441]) expect(await save("message.unanswered", { minutes })).toEqual({ ok: false, message: admin.minutesInvalid(1440) });
  });

  it("порог заполненности книги: стёрли поле («») — ошибка, а не «без порога»; выключили (null) — без порога", async () => {
    expect(await save("deal.event_date_near", { bookBelow: "" })).toEqual({ ok: false, message: admin.bookBelowInvalid });
    expect(await save("deal.event_date_near", { bookBelow: "40" })).toMatchObject({ ok: true });
    expect(await save("deal.event_date_near", { bookBelow: null })).toMatchObject({ ok: true });
    expect(w.saved.map((r) => (r as { conditions: unknown }).conditions)).toEqual([{ bookBelow: 40 }, { bookBelow: null }]);
  });
});
