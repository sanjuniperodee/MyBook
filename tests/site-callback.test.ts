import { describe, expect, it } from "vitest";
import { SiteChatService } from "@/modules/messaging/application/services";
import { addWorkMinutes, type WorkHours } from "@/shared/domain/schedule";

const HOURS: WorkHours = { days: [1, 2, 3, 4, 5, 6, 7], from: "09:00", to: "21:00" };

/**
 * «Перезвоните мне» с сайта (tasks-d2): задача «позвонить» — через 15 рабочих минут. Заявка ночью не просрочена к началу
 * смены: срок — начало смены + 15 минут, как у пропущенного звонка.
 */
function setup(now: Date) {
  const tasks: { title: string; kind: string; dueAt: Date; assigneeId: string | null }[] = [];
  const sales = {
    findClientByPhone: async () => null,
    findOpenDeal: async () => null,
    createDeal: async () => ({ id: "deal-1", assigneeId: null, clientId: null }),
    note: async () => {},
  };
  const notifier = { notify: async () => {} };
  const live = { notificationsChanged: () => {} };
  const schedule = { addWorkMinutes: async (from: Date, minutes: number) => addWorkMinutes(from, minutes, HOURS, "Asia/Almaty") };
  const site = new SiteChatService({} as never, sales as never, { create: async (t: (typeof tasks)[number]) => void tasks.push(t) }, notifier, live as never, { now: () => now }, { uuid: () => "u", visitorChatId: (t) => t }, schedule);
  return { site, tasks };
}

describe("«Перезвоните мне»: срок в рабочих минутах", () => {
  it("днём — через 15 минут", async () => {
    const t = setup(new Date("2026-10-01T12:00:00+05:00"));
    await t.site.requestCallback({ name: "Айгерим", phone: "87011234567" });
    expect(t.tasks).toEqual([expect.objectContaining({ kind: "call", dueAt: new Date("2026-10-01T12:15:00+05:00") })]);
  });

  it("в 23:00 — к началу смены + 15 минут, а не просрочено к утру", async () => {
    const t = setup(new Date("2026-10-01T23:00:00+05:00"));
    await t.site.requestCallback({ name: "Айгерим", phone: "87011234567" });
    expect(t.tasks[0].dueAt).toEqual(new Date("2026-10-02T09:15:00+05:00"));
  });
});
