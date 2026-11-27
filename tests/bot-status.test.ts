import { describe, expect, it, vi } from "vitest";

/** Статус бота в чате (полоса в CRM рисует его в mybook-web — там и тест экранов бота). */
const { botStatus } = await import("@/modules/messaging/application/botPreview");
const { newBotState } = await import("@/modules/messaging/domain/botEngine");

const fields = [
  { key: "recipient", label: "Для кого", type: "text", options: [] },
  { key: "occasion", label: "Повод", type: "select", options: ["Годовщина", "День рождения"] },
  { key: "event_date", label: "Дата события", type: "date", options: [] },
  { key: "format", label: "Формат", type: "select", options: ["Печатная", "Электронная"] },
];

describe("бот в чате", () => {
  it("статус бота: вопрос N из M, можно остановить; бот не работал — статуса нет", () => {
    const state = { ...newBotState(new Date(), true), phase: "active" as const, questions: ["recipient", "occasion"], asking: "occasion" };
    const active = botStatus({ botStep: 1, state, dueAt: null }, fields);
    expect(active).toMatchObject({ label: "Бот: вопрос 2 из 2 (Повод)", canStop: true, canStart: false });
    const none = botStatus(null, fields);
    expect(none).toEqual({ label: null, tone: "none", canStop: false, canStart: true });
    const stopped = botStatus({ botStep: -1, state: { ...state, phase: "done", outcome: "skipped", reason: "prior_chat" }, dueAt: null }, fields);
    expect(stopped.label).toBe("Бот не начинал: переписка была до CRM");
    const offer = botStatus({ botStep: 0, state: { ...state, stage: "offer", asking: null }, dueAt: null }, fields);
    expect(offer.label).toBe("Бот сделал предложение — ждёт ответа клиента");
    // AI-продажник и подхват переписки.
    const ai = { ...state, engine: "ai" as const, asking: null, ai: { ...state.ai, takeover: true } };
    expect(botStatus({ botStep: 0, state: ai, dueAt: null }, fields).label).toBe("Бот подхватил переписку");
    expect(botStatus({ botStep: 0, state: { ...ai, ai: { ...ai.ai, takeover: false, stage: "objection" as const } }, dueAt: null }, fields).label).toBe("AI-продажник ведёт диалог, снимает возражение");
    expect(botStatus({ botStep: null, state: { ...ai, phase: "waiting", reason: "takeover" }, dueAt: null }, fields)).toMatchObject({ label: "Менеджер не отвечает — бот подхватит переписку", tone: "waiting", canStop: true });

    // Клиент замолчал ночью: напоминание отложено до начала рабочего дня — статус говорит, с каких пор тишина и когда бот напишет.
    vi.stubEnv("TZ", "Asia/Almaty");
    const silent = { ...ai, lastBotAt: "2026-10-19T19:09:34Z", ai: { ...ai.ai, takeover: false, stage: "objection" as const } };
    const due = new Date("2026-10-20T05:00:00Z");
    expect(botStatus({ botStep: 0, state: silent, dueAt: due }, fields, new Date("2026-10-20T04:37:00Z"))).toMatchObject({
      label: "Клиент молчит с 00:09 — бот напомнит в 10:00",
      tone: "waiting",
      canStop: true,
    });
    // Не сегодня — с датой: напоминание «на следующий день».
    expect(botStatus({ botStep: 0, state: silent, dueAt: new Date("2026-10-21T05:00:00Z") }, fields, new Date("2026-10-20T12:00:00Z")).label).toBe("Клиент молчит с 00:09 — бот напомнит 21 октября в 10:00");
    expect(botStatus({ botStep: 0, state: silent, dueAt: new Date("2026-10-21T05:00:00Z") }, fields, new Date("2026-10-21T03:00:00Z")).label).toBe("Клиент молчит с 20 октября 00:09 — бот напомнит в 10:00");
    // Все напоминания уже отправлены — дальше только итог менеджеру.
    const tired = { ...silent, ai: { ...silent.ai, followUps: 3 } };
    expect(botStatus({ botStep: 0, state: tired, dueAt: due }, fields, new Date("2026-10-20T04:37:00Z")).label).toBe("Клиент молчит с 00:09 — итог менеджеру в 10:00");
    // Срок через секунды — пауза перед ответом на свежее сообщение клиента, статус прежний.
    expect(botStatus({ botStep: 0, state: silent, dueAt: new Date("2026-10-20T04:37:05Z") }, fields, new Date("2026-10-20T04:37:00Z")).label).toBe("AI-продажник ведёт диалог, снимает возражение");
    vi.unstubAllEnvs();
  });
});
