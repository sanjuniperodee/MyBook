import { describe, expect, it } from "vitest";
import { AutomationEngine, type AutomationEffects, type RuleRepository, type SalesGateway, type ScheduledSource, type SubjectLoader } from "@/modules/automation/application";
import type { AutomationRule, RuleSubject } from "@/modules/automation/domain";
import { addWorkMinutes, parseWorkHours } from "@/shared/domain/schedule";
import { inbound, setup as chatSetup } from "./doubles/botHarness";
import { setup as clientsSetup } from "./doubles/clients";

const now = new Date("2026-10-01T06:00:00Z");

function setup(rules: AutomationRule[], opts: { workTime?: boolean; subject?: Partial<RuleSubject>; onMove?: (dealId: string, stageId: string) => Promise<void>; scheduled?: Partial<ScheduledSource>; active?: RuleRepository["active"]; canMessage?: () => boolean; createTask?: AutomationEffects["createTask"]; now?: Date } = {}) {
  const claimed = new Set<string>();
  const log: string[] = [];
  const tasks: Parameters<AutomationEffects["createTask"]>[0][] = [];
  const repo: RuleRepository = {
    active: opts.active ?? (async (trigger) => rules.filter((r) => !trigger || r.trigger === trigger)),
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
    createTask: async (t) => {
      log.push(`task:${t.title}:${t.assigneeId}`);
      tasks.push(t);
      if (opts.createTask) return opts.createTask(t);
      return true;
    },
    // Название правила уходит в отправку: текст с реквизитами не отправится, а в заметке будет видно, какое правило.
    sendMessage: async (id, text, o) => void log.push(`msg:${id}:${text}${o ? ` (${o.rule}${o.reply ? ", ответ" : ""})` : ""}`),
    canMessageNow: async () => (log.push("gate"), opts.canMessage?.() ?? true),
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
  const scheduled: ScheduledSource = { unanswered: async () => [], inactiveClients: async () => [], anniversaries: async () => [], ...opts.scheduled };
  // График по умолчанию — каждый день 09:00–21:00 по Алматы (UTC+5).
  const hours = parseWorkHours(null);
  const schedule = { isWorkTime: async () => opts.workTime ?? true, workMinutesBetween: async () => 0, addWorkMinutes: async (from: Date, min: number) => addWorkMinutes(from, min, hours, "Asia/Almaty") };
  const errors: string[] = [];
  const quiet = { info: () => {}, warn: () => {}, error: (m: string) => void errors.push(m) };
  const engine = new AutomationEngine(repo, loader, effects, sales, schedule, scheduled, { url: "https://mybook.kz" }, { now: () => opts.now ?? now }, quiet);
  return { engine, log, errors, tasks };
}

const rule = (p: Partial<AutomationRule>): AutomationRule => ({ id: "r1", name: "Правило", trigger: "deal.created", conditions: {}, actions: [], ...p });

describe("AutomationEngine", () => {
  it("правило срабатывает для объекта один раз", async () => {
    const { engine, log } = setup([rule({ actions: [{ type: "send_message", text: "Здравствуйте, {имя}!" }] })]);
    await engine.run("deal.created", { subject: "d1" });
    await engine.run("deal.created", { subject: "d1" });
    expect(log).toEqual(["msg:conv1:Здравствуйте, Айгерим! (Правило)", "run:r1"]);
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

describe("AutomationEngine: правила по времени не обрывают минутный проход", () => {
  const failing = async (): Promise<never> => {
    throw new Error("relation does not exist");
  };

  it("правила не загрузились — проход возвращает 0 и пишет ошибку в лог, а не бросает", async () => {
    const { engine, errors } = setup([], { active: failing });
    await expect(engine.runScheduled({ force: true })).resolves.toBe(0);
    expect(errors).toEqual(["правила по времени: загрузка правил и графика"]);
  });

  it("выборка одного правила упала — остальные правила срабатывают, в логе имя упавшего", async () => {
    const lastSeen = new Date("2026-09-20T00:00:00Z");
    const { engine, log, errors } = setup(
      [
        rule({ id: "sla", name: "SLA", trigger: "message.unanswered", actions: [{ type: "notify", title: "SLA" }] }),
        rule({ id: "inactive", name: "Забросил книгу", trigger: "client.inactive", actions: [{ type: "notify", title: "Вернуть" }] }),
        rule({ id: "anniversary", name: "Годовщина", trigger: "occasion.anniversary", actions: [{ type: "notify", title: "Годовщина" }] }),
      ],
      { scheduled: { unanswered: failing, inactiveClients: async () => [{ dealId: "d1", clientId: "c1", lastSeen }], anniversaries: failing } },
    );
    await expect(engine.runScheduled({ force: true })).resolves.toBe(1);
    expect(log).toEqual(["notify:staff:Вернуть", "run:inactive"]);
    expect(errors).toEqual(["«SLA»: выборка правила по времени", "«Годовщина»: выборка правила по времени"]);
  });
});

describe("AutomationEngine: окно и суточный лимит сообщений от правил (automation-15)", () => {
  const lastSeen = new Date("2026-09-20T00:00:00Z");
  const two = { inactiveClients: async () => [{ dealId: "d1", clientId: "c1", lastSeen }, { dealId: "d2", clientId: "c2", lastSeen }] };

  it("правило по времени с сообщением вне окна не застолбляет объект: в следующем проходе срабатывает целиком; без сообщения — сразу", async () => {
    let open = false;
    const { engine, log } = setup(
      [
        rule({ id: "back", trigger: "client.inactive", actions: [{ type: "create_task", title: "Вернуть" }, { type: "send_message", text: "Вы начали книгу" }] }),
        rule({ id: "staff", trigger: "client.inactive", actions: [{ type: "notify", title: "Без сообщения" }] }),
      ],
      { scheduled: two, canMessage: () => open },
    );
    expect(await engine.runScheduled({ force: true })).toBe(2);
    // Окно проверено один раз за проход; правило без сообщения клиенту окно не держит.
    expect(log).toEqual(["gate", "notify:staff:Без сообщения", "run:staff", "notify:staff:Без сообщения", "run:staff"]);
    open = true;
    log.length = 0;
    expect(await engine.runScheduled({ force: true })).toBe(2);
    expect(log.filter((l) => l.startsWith("msg:") || l.startsWith("task:"))).toEqual(["task:Вернуть:null", "msg:conv1:Вы начали книгу (Правило)", "task:Вернуть:null", "msg:conv1:Вы начали книгу (Правило)"]);
    expect(log).not.toContain("notify:staff:Без сообщения");
  });

  it("событийные правила окно не спрашивают: автоответ на входящее помечен «ответ», остальные — нет", async () => {
    const { engine, log } = setup(
      [rule({ id: "auto", trigger: "message.incoming", actions: [{ type: "send_message", text: "Ответим утром" }] }), rule({ id: "hi", trigger: "deal.created", actions: [{ type: "send_message", text: "Здравствуйте" }] })],
      { canMessage: () => false },
    );
    await engine.run("message.incoming", { subject: "conv1:2026-10-01", conversationId: "conv1" });
    await engine.run("deal.created", { subject: "d1" });
    expect(log).toEqual(["msg:conv1:Ответим утром (Правило, ответ)", "run:auto", "msg:conv1:Здравствуйте (Правило)", "run:hi"]);
  });
});

describe("Задачи правил: срок в рабочем времени, без дублей; «ответить» закрывается ответом (automation-12, automation-d3)", () => {
  const missedCall = rule({ id: "missed", name: "Пропущенный звонок → задача перезвонить", trigger: "call.missed", actions: [{ type: "create_task", title: "Перезвонить: пропущенный звонок", dueMinutes: 15 }] });

  it("пропущенный звонок в 23:00 — срок «начало смены + 15 мин» (09:15), а не просрочен к началу смены", async () => {
    const { engine, tasks } = setup([missedCall], { now: new Date("2026-10-01T18:00:00Z") }); // 23:00 по Алматы
    await engine.run("call.missed", { subject: "call-1", callId: "call-1", dealId: "d1" });
    expect(tasks).toEqual([expect.objectContaining({ kind: "call", dealId: "d1", once: true, dueAt: new Date("2026-10-02T04:15:00Z") })]);
  });

  it("днём — через 15 минут; срок от суток — календарный, а ночью — к началу смены", async () => {
    const day = setup([missedCall], { now: new Date("2026-10-01T06:00:00Z") }); // 11:00
    await day.engine.run("call.missed", { subject: "call-2", callId: "call-2" });
    expect(day.tasks[0].dueAt).toEqual(new Date("2026-10-01T06:15:00Z"));
    const later = rule({ id: "later", actions: [{ type: "create_task", title: "Предложить книгу", dueMinutes: 1440 }] });
    const evening = setup([later], { now: new Date("2026-10-01T15:30:00Z") }); // 20:30 → завтра 20:30
    await evening.engine.run("deal.created", { subject: "d1" });
    expect(evening.tasks[0].dueAt).toEqual(new Date("2026-10-02T15:30:00Z"));
    const night = setup([later], { now: new Date("2026-10-01T18:00:00Z") }); // 23:00 → завтра 23:00 → послезавтра 09:00
    await night.engine.run("deal.created", { subject: "d1" });
    expect(night.tasks[0].dueAt).toEqual(new Date("2026-10-03T04:00:00Z"));
  });

  it("такая задача по сделке уже открыта — вторая не ставится и уведомления о ней нет", async () => {
    const { engine, log } = setup([missedCall], { createTask: async () => false });
    await engine.run("call.missed", { subject: "call-3", callId: "call-3" });
    expect(log.filter((l) => l.startsWith("notify:"))).toEqual([]);
  });

  it("эхо ответа с телефона магазина и ответ из CRM закрывают задачи «ответить» по сделке; звонок и сообщение бота — нет", async () => {
    const crm = clientsSetup();
    const chat = chatSetup({ answeredTasks: { answered: (dealId) => crm.tasks.closeAnswered(dealId) } });
    await chat.service.ingest(inbound({ externalId: "in-1", text: "Здравствуйте, сколько стоит?" }));
    const dealId = chat.conv().dealId!;
    const open = async (title: string, kind: "message" | "call") => crm.tasks.createSystem({ title, kind, dueAt: new Date("2026-10-01T06:15:00Z"), dealId, assigneeId: "m1" });
    await open("Ответить: Айгерим (правило)", "message");
    await open("Перезвонить: пропущенный звонок", "call");
    const state = () => [...crm.mem.tasks.rows.values()].map((t) => [t.kind, t.doneAt ? "закрыта" : "открыта", t.result ?? null]);
    // Сообщение бота клиенту — не ответ человека.
    await chat.service.send(chat.conv().id, "Здравствуйте! Я помощник", null, "bot");
    expect(state()).toEqual([["message", "открыта", null], ["call", "открыта", null]]);
    // Ответ с телефона магазина (эхо) — задача «ответить» сделана, звонок остаётся.
    await chat.service.ingest(inbound({ externalId: "phone-1", isEcho: true, text: "Добрый день! 15 000 ₸", contactName: "" }));
    expect(state()).toEqual([["message", "закрыта", "ответили в чате"], ["call", "открыта", null]]);
    // Новая задача «ответить» — её закрывает ответ менеджера из CRM.
    await open("Ответить: Айгерим (бот)", "message");
    await chat.service.send(chat.conv().id, "Подскажу по срокам", "m1");
    expect(state().at(-1)).toEqual(["message", "закрыта", "ответили в чате"]);
  });
});
