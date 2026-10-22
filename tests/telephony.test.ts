import { describe, expect, it } from "vitest";
import { Call, type CallEvent } from "@/modules/telephony/domain";
import { CallsService, type CallRepository, type CallSideEffects, type SalesGateway } from "@/modules/telephony/application";

const now = new Date("2026-10-01T06:00:00Z");
const event = (p: Partial<CallEvent>): CallEvent => ({ provider: "zadarma", externalId: "x1", stage: "start", direction: "in", clientPhone: "77011234567", extension: null, at: now, ...p });

describe("Call", () => {
  it("звонит → ответили → завершён; повторное завершение ничего не меняет", () => {
    const call = Call.ring("c1", event({}), { staffId: null, clientId: null, dealId: null });
    expect(call.apply(event({ stage: "answer", extension: "101" }), "m1", now)).toBe("changed");
    expect(call.apply(event({ stage: "end", durationSec: 75 }), null, now)).toBe("finish");
    expect(call.snapshot()).toMatchObject({ status: "answered", staffId: "m1", durationSec: 75, endedAt: now });
    expect(call.apply(event({ stage: "end" }), null, now)).toBe("unchanged");
    expect(call.summary("Айгерим")).toBe("Входящий звонок, 1:15 · Айгерим");
  });

  it("без ответа — пропущенный входящий", () => {
    const call = Call.ring("c1", event({}), { staffId: null, clientId: null, dealId: null });
    call.apply(event({ stage: "end" }), null, now);
    expect(call.isMissed).toBe(true);
    expect(call.summary(null)).toBe("Пропущенный входящий звонок");
  });
});

function setup(opts: { blocked?: boolean; client?: string; staff?: { name: string; email: string }; openDeal?: string; owner?: string | null } = {}) {
  const rows = new Map<string, Call>();
  const log: string[] = [];
  const repo: CallRepository = {
    nextId: () => `c${rows.size + 1}`,
    findByExternal: async (_p, ext) => [...rows.values()].find((c) => c.snapshot().externalId === ext) ?? null,
    add: async (c) => !!rows.set(c.id, c),
    save: async () => {},
    update: async () => true,
    finish: async (c) => !log.includes(`finished:${c.id}`) && !!log.push(`finished:${c.id}`),
    markMissedHandled: async (phone) => void log.push(`handled:${phone}`),
    markHandled: async () => {},
  };
  const sales: SalesGateway = {
    findClientByPhone: async () => opts.client ?? null,
    findOpenDealId: async () => opts.openDeal ?? null,
    createCallDeal: async (i) => (log.push(`deal:${i.title}`), { id: "d1", clientId: null }),
    dealOwner: async () => ({ assigneeId: opts.owner === undefined ? "m2" : opts.owner, contactName: "Айгерим" }),
    acceptDeal: async (dealId, staffId, how) => void log.push(`accept:${dealId}:${staffId}:${how}`),
  };
  const effects: CallSideEffects = {
    isBlocked: async () => !!opts.blocked,
    notifyMissed: async (to, n) => void log.push(`notify:${to}:${n.title}`),
    callChanged: () => {},
    missedRules: async (ctx) => void log.push(`rules:${ctx.callId}`),
  };
  const service = new CallsService(repo, { byExtension: async (e) => (e ? "m1" : null), byId: async () => opts.staff ?? { name: "Менеджер", email: "manager@mybook.kz" } }, sales, { record: async (e) => void log.push(`note:${e.text}`) }, effects, { now: () => now });
  return { service, log };
}

describe("CallsService", () => {
  it("пропущенный с нового номера: заявка, уведомление ответственному, правила CRM — один раз", async () => {
    const { service, log } = setup();
    await service.handle(event({}));
    await service.handle(event({ stage: "end" }));
    await service.handle(event({ stage: "end" }));
    expect(log).toEqual(["finished:c1", "deal:Звонок: …4567", "notify:m2:Пропущенный звонок: …4567", "rules:c1"]);
  });

  it("дозвонились — прошлые пропущенные с номера обработаны", async () => {
    const { service, log } = setup();
    await service.handle(event({ stage: "answer", extension: "101" }));
    await service.handle(event({ stage: "end", durationSec: 30 }));
    expect(log).toContain("handled:77011234567");
    expect(log.some((l) => l.startsWith("notify"))).toBe(false);
  });

  it("в ленту клиента сотрудник записывается как везде в CRM: имя, а у «Администратора» — логин из почты", async () => {
    for (const [staff, who] of [
      [{ name: "Айгерим", email: "aigerim@mybook.kz" }, "Айгерим"],
      [{ name: "Администратор", email: "boss@mybook.kz" }, "boss"],
    ] as const) {
      const { service, log } = setup({ client: "u7", staff });
      await service.handle(event({ stage: "answer", extension: "101" }));
      await service.handle(event({ stage: "end", durationSec: 30 }));
      expect(log).toContain(`note:Входящий звонок, 0:30 · ${who}`);
    }
  });

  it("менеджер поговорил с клиентом — заявка принята в работу: входящий с нового номера, входящий по открытой сделке, исходящий", async () => {
    let t = setup();
    await t.service.handle(event({ stage: "answer", extension: "101" }));
    await t.service.handle(event({ stage: "end", durationSec: 30 }));
    expect(t.log).toEqual(["finished:c1", "deal:Звонок: …4567", "accept:d1:m1:входящий звонок принят", "handled:77011234567"]);

    t = setup({ openDeal: "d7" });
    await t.service.handle(event({ stage: "answer", extension: "101" }));
    await t.service.handle(event({ stage: "end", durationSec: 30 }));
    expect(t.log).toContain("accept:d7:m1:входящий звонок принят");

    t = setup({ openDeal: "d7" });
    await t.service.handle(event({ direction: "out", stage: "answer", extension: "101" }));
    await t.service.handle(event({ direction: "out", stage: "end", durationSec: 30 }));
    expect(t.log).toContain("accept:d7:m1:исходящий звонок клиенту");
  });

  it("менеджер набрал клиента и не дозвонился — заявка всё равно его; пропущенный входящий заявку не принимает", async () => {
    let t = setup({ openDeal: "d7" });
    await t.service.handle(event({ direction: "out", stage: "start", extension: "101" }));
    await t.service.handle(event({ direction: "out", stage: "end", status: "busy" }));
    expect(t.log).toContain("accept:d7:m1:менеджер набрал клиента");

    t = setup({ openDeal: "d7" });
    await t.service.handle(event({}));
    await t.service.handle(event({ stage: "end" }));
    expect(t.log.some((l) => l.startsWith("accept"))).toBe(false);
  });

  it("внутренний номер неизвестен — принимает ответственный по сделке; ответственного нет — заявка остаётся неразобранной", async () => {
    let t = setup({ openDeal: "d7" });
    await t.service.handle(event({ stage: "answer" }));
    await t.service.handle(event({ stage: "end", durationSec: 10 }));
    expect(t.log).toContain("accept:d7:m2:входящий звонок принят");

    t = setup({ openDeal: "d7", owner: null });
    await t.service.handle(event({ stage: "answer" }));
    await t.service.handle(event({ stage: "end", durationSec: 10 }));
    expect(t.log.some((l) => l.startsWith("accept"))).toBe(false);
  });

  it("номер в спаме: звонок в журнале, без заявки и уведомлений; запись без звонка игнорируется", async () => {
    const { service, log } = setup({ blocked: true });
    expect(await service.handle(event({ externalId: "x9", stage: "record" }))).toBeNull();
    await service.handle(event({}));
    await service.handle(event({ stage: "end" }));
    expect(log).toEqual(["finished:c1"]);
  });
});
