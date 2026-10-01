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

function setup(opts: { blocked?: boolean } = {}) {
  const rows = new Map<string, Call>();
  const log: string[] = [];
  const repo: CallRepository = {
    nextId: () => `c${rows.size + 1}`,
    findByExternal: async (_p, ext) => [...rows.values()].find((c) => c.snapshot().externalId === ext) ?? null,
    add: async (c) => !!rows.set(c.id, c),
    save: async () => {},
    finish: async (c) => !log.includes(`finished:${c.id}`) && !!log.push(`finished:${c.id}`),
    markMissedHandled: async (phone) => void log.push(`handled:${phone}`),
  };
  const sales: SalesGateway = {
    findClientByPhone: async () => null,
    findOpenDealId: async () => null,
    createCallDeal: async (i) => (log.push(`deal:${i.title}`), { id: "d1", clientId: null }),
    dealOwner: async () => ({ assigneeId: "m2", contactName: "Айгерим" }),
  };
  const effects: CallSideEffects = {
    isBlocked: async () => !!opts.blocked,
    notifyMissed: async (to, n) => void log.push(`notify:${to}:${n.title}`),
    callChanged: () => {},
    missedRules: async (ctx) => void log.push(`rules:${ctx.callId}`),
  };
  const service = new CallsService(repo, { byExtension: async (e) => (e ? "m1" : null), displayName: async () => "Менеджер" }, sales, { record: async (e) => void log.push(`note:${e.text}`) }, effects, { now: () => now });
  return { service, log };
}

describe("CallsService", () => {
  it("пропущенный с нового номера: заявка, уведомление ответственному, правила CRM — один раз", async () => {
    const { service, log } = setup();
    await service.handle(event({}));
    await service.handle(event({ stage: "end" }));
    await service.handle(event({ stage: "end" }));
    expect(log).toEqual(["finished:c1", "deal:Звонок: +7 701 123 45 67", "notify:m2:Пропущенный звонок: +7 701 123 45 67", "rules:c1"]);
  });

  it("дозвонились — прошлые пропущенные с номера обработаны", async () => {
    const { service, log } = setup();
    await service.handle(event({ stage: "answer", extension: "101" }));
    await service.handle(event({ stage: "end", durationSec: 30 }));
    expect(log).toContain("handled:77011234567");
    expect(log.some((l) => l.startsWith("notify"))).toBe(false);
  });

  it("номер в спаме: звонок в журнале, без заявки и уведомлений; запись без звонка игнорируется", async () => {
    const { service, log } = setup({ blocked: true });
    expect(await service.handle(event({ externalId: "x9", stage: "record" }))).toBeNull();
    await service.handle(event({}));
    await service.handle(event({ stage: "end" }));
    expect(log).toEqual(["finished:c1"]);
  });
});
