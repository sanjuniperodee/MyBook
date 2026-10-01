import { describe, expect, it } from "vitest";
import { AutomationEngine, type AutomationEffects, type RuleRepository, type SalesGateway, type ScheduledSource, type SubjectLoader } from "@/modules/automation/application";
import type { AutomationRule, RuleSubject } from "@/modules/automation/domain";

const now = new Date("2026-10-01T06:00:00Z");

function setup(rules: AutomationRule[], opts: { workTime?: boolean; subject?: Partial<RuleSubject>; onMove?: (dealId: string, stageId: string) => Promise<void> } = {}) {
  const claimed = new Set<string>();
  const log: string[] = [];
  const repo: RuleRepository = {
    active: async (trigger) => rules.filter((r) => !trigger || r.trigger === trigger),
    claim: async (id, subject) => !claimed.has(`${id}:${subject}`) && !!claimed.add(`${id}:${subject}`),
    markRun: async (id) => void log.push(`run:${id}`),
  };
  const subject = (): RuleSubject => ({ deal: { id: "d1", number: 5, title: "Заявка", assigneeId: null, orderId: null, clientId: "c1", customFields: {} }, clientId: "c1", name: "Айгерим", assigneeId: null, ...opts.subject });
  const loader: SubjectLoader = {
    load: async () => subject(),
    managerName: async (id) => (id ? "Менеджер" : ""),
    dealFieldVars: async () => ({}),
    latestConversation: async () => "conv1",
    clientContact: async () => ({ name: "Айгерим", email: "a@test.kz", phone: null, managerId: null }),
  };
  const effects: AutomationEffects = {
    createTask: async (t) => void log.push(`task:${t.title}:${t.assigneeId}`),
    sendMessage: async (id, text) => void log.push(`msg:${id}:${text}`),
    assignConversation: async () => {},
    notify: async (to, n) => void log.push(`notify:${Array.isArray(to) ? to.join(",") : to}:${n.title}`),
  };
  const sales: SalesGateway = {
    nextRoundRobin: async () => "m2",
    assign: async (d, u) => void log.push(`assign:${d}:${u}`),
    move: async (d, s) => {
      log.push(`move:${d}:${s}`);
      await opts.onMove?.(d, s);
    },
    findOpenDealId: async () => null,
    createDeal: async () => ({ id: "d9", assigneeId: null }),
  };
  const scheduled: ScheduledSource = { unanswered: async () => [], inactiveClients: async () => [], anniversaries: async () => [] };
  const schedule = { isWorkTime: async () => opts.workTime ?? true, workMinutesBetween: async () => 0 };
  const quiet = { info: () => {}, warn: () => {}, error: () => {} };
  const engine = new AutomationEngine(repo, loader, effects, sales, schedule, scheduled, { url: "https://mybook.kz" }, { now: () => now }, quiet);
  return { engine, log };
}

const rule = (p: Partial<AutomationRule>): AutomationRule => ({ id: "r1", name: "Правило", trigger: "deal.created", conditions: {}, actions: [], ...p });

describe("AutomationEngine", () => {
  it("правило срабатывает для объекта один раз", async () => {
    const { engine, log } = setup([rule({ actions: [{ type: "send_message", text: "Здравствуйте, {имя}!" }] })]);
    await engine.run("deal.created", { subject: "d1" });
    await engine.run("deal.created", { subject: "d1" });
    expect(log).toEqual(["msg:conv1:Здравствуйте, Айгерим!", "run:r1"]);
  });

  it("условия: источник и рабочее время", async () => {
    const { engine, log } = setup([rule({ id: "wa", conditions: { source: "whatsapp" }, actions: [{ type: "notify", title: "WA" }] }), rule({ id: "night", conditions: { hours: "off" }, actions: [{ type: "notify", title: "Ночь" }] })], { workTime: true });
    await engine.run("deal.created", { subject: "d1", source: "site" });
    expect(log).toEqual([]);
    await engine.run("deal.created", { subject: "d2", source: "whatsapp" });
    expect(log).toEqual(["notify:staff:WA", "run:wa"]);
  });

  it("назначение по кругу, затем задача ответственному", async () => {
    const { engine, log } = setup([rule({ actions: [{ type: "assign" }, { type: "create_task", title: "Позвонить {имя}" }] })]);
    await engine.run("deal.created", { subject: "d1" });
    expect(log.slice(0, 3)).toEqual(["assign:d1:m2", "task:Позвонить Айгерим:m2", "notify:m2:Задача: Позвонить Айгерим"]);
  });

  it("правила, которые двигают сделку друг за другом, не зацикливаются", async () => {
    const ref: { engine?: AutomationEngine } = {};
    let moves = 0;
    const ctx = setup([rule({ trigger: "deal.stage_changed", actions: [{ type: "move_stage", stageId: "s" }] })], {
      onMove: async (d) => {
        moves++;
        await ref.engine!.run("deal.stage_changed", { subject: `${d}:${moves}` });
      },
    });
    ref.engine = ctx.engine;
    await ctx.engine.run("deal.stage_changed", { subject: "d1:0" });
    expect(moves).toBe(3);
  });
});
