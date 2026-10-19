import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AutomationEngine, type AutomationEffects, type RuleRepository, type SalesGateway, type ScheduledSource, type SubjectLoader } from "@/modules/automation/application";
import { isTrigger } from "@/modules/automation/domain/meta";
import { DEFAULT_HOLIDAYS, relevantConditions, type AutomationRule, type Holiday, type RuleAction, type RuleSubject } from "@/modules/automation/domain";
import { findSensitive } from "@/modules/messaging/domain/sensitive";
import { orderNotice, type OrderNoticeFacts } from "@/modules/ordering/ui/notice";
import { addWorkMinutes, parseWorkHours } from "@/shared/domain/schedule";
import { InProcessEventBus } from "@/shared/infrastructure/InProcessEventBus";
import { inbound, setup as chatSetup } from "./doubles/botHarness";
import { setup as clientsSetup } from "./doubles/clients";
import { admin as orderingAdmin, setup as orderingSetup } from "./doubles/ordering";

const now = new Date("2026-10-01T06:00:00Z");

function setup(
  rules: AutomationRule[],
  opts: {
    workTime?: boolean;
    subject?: Partial<RuleSubject>;
    onMove?: (dealId: string, stageId: string) => Promise<void>;
    scheduled?: Partial<ScheduledSource>;
    active?: RuleRepository["active"];
    canMessage?: () => boolean;
    createTask?: AutomationEffects["createTask"];
    now?: Date;
    holidays?: Holiday[];
    /** Переписка клиента в WhatsApp (сообщения о заказе); null — её нет. */
    whatsapp?: string | null;
  } = {},
) {
  const claimed = new Set<string>();
  const log: string[] = [];
  const tasks: Parameters<AutomationEffects["createTask"]>[0][] = [];
  const repo: RuleRepository = {
    active: opts.active ?? (async (trigger) => rules.filter((r) => !trigger || r.trigger === trigger)),
    claim: async (id, subject) => !claimed.has(`${id}:${subject}`) && !!claimed.add(`${id}:${subject}`),
    markRun: async (id) => void log.push(`run:${id}`),
  };
  const subject = (): RuleSubject => ({ deal: { id: "d1", number: 5, title: "Заявка", assigneeId: null, orderId: null, clientId: "c1", customFields: {} }, clientId: "c1", name: "Айгерим", assigneeId: null, ...opts.subject });
  const loaded: Parameters<SubjectLoader["load"]>[0][] = [];
  const loader: SubjectLoader = {
    // Сделка по id из контекста (например, только что созданная правилом) — с этим id.
    load: async (ctx) => {
      loaded.push(ctx);
      const s = subject();
      return ctx.dealId ? { ...s, deal: { id: ctx.dealId, number: 9, title: "Сделка", assigneeId: null, orderId: null, clientId: s.clientId, customFields: {} } } : s;
    },
    managerName: async (id) => (id ? "Менеджер" : ""),
    dealFieldVars: async () => ({}),
    latestConversation: async () => "conv1",
    latestWhatsapp: async () => (opts.whatsapp === undefined ? "conv1" : opts.whatsapp),
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
    sendMessage: async (id, text, o) => void log.push(`msg:${id}:${text}${o ? ` (${o.rule}${o.reply ? ", ответ" : ""}${o.transactional ? ", о заказе" : ""}${o.allow?.length ? `, можно: ${o.allow.join(" ")}` : ""})` : ""}`),
    canMessageNow: async () => (log.push("gate"), opts.canMessage?.() ?? true),
    assignConversation: async () => {},
    addNote: async (n) => void log.push(`note:${n.dealId}:${n.text}`),
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
    createDeal: async (input) => (log.push(`deal:${input.source}:${input.title}:${input.automationId}`), { id: "d9", assigneeId: null }),
  };
  const scheduled: ScheduledSource = { unanswered: async () => [], inactiveClients: async () => [], anniversaries: async () => [], holidayBuyers: async () => [], firedOn: async () => 0, ...opts.scheduled };
  // График по умолчанию — каждый день 09:00–21:00 по Алматы (UTC+5).
  const hours = parseWorkHours(null);
  const schedule = { isWorkTime: async () => opts.workTime ?? true, workMinutesBetween: async () => 0, addWorkMinutes: async (from: Date, min: number) => addWorkMinutes(from, min, hours, "Asia/Almaty") };
  const errors: string[] = [];
  const quiet = { info: () => {}, warn: () => {}, error: (m: string) => void errors.push(m) };
  const holidays = { list: async () => opts.holidays ?? [...DEFAULT_HOLIDAYS] };
  const engine = new AutomationEngine(repo, loader, effects, sales, schedule, scheduled, { url: "https://mybook.kz" }, { now: () => opts.now ?? now }, quiet, holidays);
  return { engine, log, errors, tasks, claimed, loaded };
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

describe("AutomationEngine: выборки правил по времени (automation-d4)", () => {
  it("выборка — своя у каждого правила: источник получает id правила, чтобы исключить объекты, где оно уже сработало", async () => {
    const asked: string[] = [];
    const lastSeen = new Date("2026-09-20T00:00:00Z");
    const { engine } = setup(
      [
        rule({ id: "sla", trigger: "message.unanswered", conditions: { minutes: 30 }, actions: [{ type: "notify" }] }),
        rule({ id: "back-5", trigger: "client.inactive", conditions: { days: 5 }, actions: [{ type: "notify" }] }),
        rule({ id: "back-10", trigger: "client.inactive", conditions: { days: 10 }, actions: [{ type: "notify" }] }),
        rule({ id: "year", trigger: "occasion.anniversary", conditions: { daysBefore: 30 }, actions: [{ type: "notify" }] }),
      ],
      {
        scheduled: {
          unanswered: async (ruleId, since) => (asked.push(`unanswered:${ruleId}:${since.toISOString()}`), []),
          inactiveClients: async (ruleId, days) => (asked.push(`inactive:${ruleId}:${days}`), [{ dealId: "d1", clientId: "c1", lastSeen }]),
          anniversaries: async (ruleId, today, daysBefore) => (asked.push(`anniversary:${ruleId}:${today}:${daysBefore}`), []),
        },
      },
    );
    expect(await engine.runScheduled({ force: true })).toBe(2);
    expect(asked).toEqual(["unanswered:sla:2026-10-01T05:30:00.000Z", "inactive:back-5:5", "inactive:back-10:10", "anniversary:year:2026-10-01:30"]);
  });
});

describe("Годовщины: сделки, проданные в чате, и язык клиента (contacts-16, automation-d6)", () => {
  const year = rule({
    id: "year",
    name: "Годовщина",
    trigger: "occasion.anniversary",
    actions: [
      { type: "create_deal", title: "Годовщина: {повод} — вторая книга" },
      { type: "create_task", title: "Предложить книгу к годовщине ({дата}): {имя}", dueMinutes: 1440 },
      { type: "send_message", text: "{имя}, скоро {повод} ({дата})", textKk: "{имя}, жақында {повод} ({дата})" },
    ],
  });
  const kk = { orderId: null, dealId: "won-1", clientId: "c1", occasion: "Годовщина", date: "15 ноября 2026 г.", year: 2026, recipient: "Ержан", client: { occasion: "Жылдық", date: "2026 жылғы 15 қараша" } };

  it("сделка из чата: объект — `deal:<id>:<год>`, выигранная сделка не становится сделкой правила — повторная продажа создаётся новой", async () => {
    const { engine, claimed, loaded, log } = setup([year], { subject: { deal: null }, scheduled: { anniversaries: async () => [kk] } });
    expect(await engine.runScheduled({ force: true })).toBe(1);
    expect([...claimed]).toEqual(["year:deal:won-1:2026"]);
    expect(loaded[0]).toMatchObject({ subject: "deal:won-1:2026", clientId: "c1" });
    expect(loaded[0].dealId).toBeUndefined();
    // «Создать сделку» создала новую (d9) — её и загрузили под задачу.
    expect(loaded[1]).toEqual({ subject: "", dealId: "d9" });
    expect(log.filter((l) => l.startsWith("task:"))).toEqual(["task:Предложить книгу к годовщине (15 ноября 2026 г.): Айгерим:null"]);
  });

  it("казахоязычному клиенту — казахский текст с поводом и датой по-казахски; в задаче и сделке сотрудникам — по-русски", async () => {
    const { engine, log } = setup([year], { subject: { deal: null, locale: "kk" }, scheduled: { anniversaries: async () => [kk] } });
    await engine.runScheduled({ force: true });
    expect(log.filter((l) => l.startsWith("task:") || l.startsWith("msg:"))).toEqual(["task:Предложить книгу к годовщине (15 ноября 2026 г.): Айгерим:null", "msg:conv1:Айгерим, жақында Жылдық (2026 жылғы 15 қараша) (Годовщина)"]);
  });

  it("казахского текста нет — русский текст с русскими подписями, языки в сообщении не смешиваются; русскоязычному — русский", async () => {
    const ruOnly = rule({ ...year, actions: [{ type: "send_message", text: "{имя}, скоро {повод} ({дата})" }] });
    const kkClient = setup([ruOnly], { subject: { deal: null, locale: "kk" }, scheduled: { anniversaries: async () => [kk] } });
    await kkClient.engine.runScheduled({ force: true });
    expect(kkClient.log.filter((l) => l.startsWith("msg:"))).toEqual(["msg:conv1:Айгерим, скоро Годовщина (15 ноября 2026 г.) (Годовщина)"]);
    const ruClient = setup([year], { subject: { deal: null, locale: "ru" }, scheduled: { anniversaries: async () => [kk] } });
    await ruClient.engine.runScheduled({ force: true });
    expect(ruClient.log.filter((l) => l.startsWith("msg:"))).toEqual(["msg:conv1:Айгерим, скоро Годовщина (15 ноября 2026 г.) (Годовщина)"]);
  });
});

describe("Праздник через N дней: повторная продажа без автоотправки (bots-10, analytics-11)", () => {
  const holiday = rule({
    id: "ny",
    name: "Праздник → повторная продажа",
    trigger: "occasion.holiday",
    conditions: { daysBefore: 30, windowDays: 30, perDay: 30 },
    actions: [
      { type: "create_deal", title: "Повторная продажа: {повод}" },
      { type: "draft_message", text: "{имя}, {повод} — {дата}, подготовим новую книгу?", textKk: "{имя}, {повод} — {дата}, жаңа кітап дайындайық па?" },
      { type: "create_task", title: "Предложить книгу к празднику «{повод}» ({дата}): {имя}", dueMinutes: 1440 },
    ],
  });
  const dec1 = new Date("2026-12-01T05:00:00Z"); // 10:00 по Алматы, до Нового года (31.12) — 30 дней
  const buyer = (clientId: string, locale: "ru" | "kk" = "ru") => ({
    clientId,
    occasion: "Новый год",
    date: "31 декабря 2026 г.",
    client: locale === "kk" ? { occasion: "Жаңа жыл", date: "2026 жылғы 31 желтоқсан" } : { occasion: "Новый год", date: "31 декабря 2026 г." },
  });

  it("покупателю прошлого года — новая сделка «повторная», готовый текст на его языке в истории сделки и задача; клиенту ничего не уходит", async () => {
    const asked: unknown[] = [];
    const { engine, log, claimed } = setup([holiday], {
      now: dec1,
      subject: { deal: null, locale: "kk" },
      scheduled: { holidayBuyers: async (ruleId, q) => (asked.push({ ruleId, ...q }), [buyer("c1", "kk")]) },
    });
    expect(await engine.runScheduled({ force: true })).toBe(1);
    expect(asked).toEqual([{ ruleId: "ny", holiday: DEFAULT_HOLIDAYS[0], date: "2026-12-31", from: "2025-12-01", to: "2025-12-31", seasonFrom: "2026-11-01", limit: 30 }]);
    expect([...claimed]).toEqual(["ny:holiday:newyear:2026:c1"]);
    expect(log).toEqual([
      "deal:repeat:Повторная продажа: Новый год:ny",
      "note:d9:Текст клиенту — отправьте сами (правило «Праздник → повторная продажа»):\nАйгерим, Жаңа жыл — 2026 жылғы 31 желтоқсан, жаңа кітап дайындайық па?",
      "task:Предложить книгу к празднику «Новый год» (31 декабря 2026 г.): Айгерим:null",
      "notify:staff:Задача: Предложить книгу к празднику «Новый год» (31 декабря 2026 г.): Айгерим",
      "run:ny",
    ]);
  });

  it("не больше perDay в день: сработавшие сегодня — из журнала (перезапуск не обнуляет); второй проход в тот же день выборку не повторяет", async () => {
    const limits: number[] = [];
    const { engine } = setup([holiday], {
      now: dec1,
      scheduled: { firedOn: async (ruleId, day) => (ruleId === "ny" && day === "2026-12-01" ? 28 : 0), holidayBuyers: async (_r, q) => (limits.push(q.limit), [buyer("c1"), buyer("c2")]) },
    });
    expect(await engine.runScheduled({ force: true })).toBe(2);
    expect(await engine.runScheduled({ force: true })).toBe(0);
    expect(limits).toEqual([2]);
  });

  it("выборки нет: вне рабочего времени, праздник дальше N дней, лимит дня выбран; условие «праздник» — только он", async () => {
    let calls = 0;
    const scheduled = { holidayBuyers: async () => (calls++, []) };
    await setup([holiday], { now: dec1, workTime: false, scheduled }).engine.runScheduled({ force: true });
    await setup([holiday], { now: new Date("2026-10-01T05:00:00Z"), scheduled }).engine.runScheduled({ force: true });
    await setup([holiday], { now: dec1, scheduled: { ...scheduled, firedOn: async () => 30 } }).engine.runScheduled({ force: true });
    await setup([rule({ ...holiday, conditions: { ...holiday.conditions, holiday: "march8" } })], { now: dec1, scheduled }).engine.runScheduled({ force: true });
    expect(calls).toBe(0);
  });

  it("без сделки готовый текст не пишется; русскоязычному — русский текст", async () => {
    const draftOnly = rule({ ...holiday, actions: [holiday.actions[1]] });
    const noDeal = setup([draftOnly], { now: dec1, subject: { deal: null }, scheduled: { holidayBuyers: async () => [buyer("c1")] } });
    await noDeal.engine.runScheduled({ force: true });
    expect(noDeal.log.filter((l) => l.startsWith("note:"))).toEqual([]);
    const ru = setup([holiday], { now: dec1, subject: { deal: null, locale: "ru" }, scheduled: { holidayBuyers: async () => [buyer("c1")] } });
    await ru.engine.runScheduled({ force: true });
    expect(ru.log.filter((l) => l.startsWith("note:"))).toEqual(["note:d9:Текст клиенту — отправьте сами (правило «Праздник → повторная продажа»):\nАйгерим, Новый год — 31 декабря 2026 г., подготовим новую книгу?"]);
  });
});

describe("Статистика повторных продаж и {получатель} (contacts-16)", () => {
  it("сделка правила помнит его id; {получатель} — из покупки, к которой годовщина, иначе поле сделки «Для кого»", async () => {
    const year = rule({ id: "year", trigger: "occasion.anniversary", actions: [{ type: "create_deal", title: "Годовщина: книга для {получатель}" }, { type: "create_task", title: "Предложить книгу для {получатель}" }] });
    const row = { orderId: "o1", dealId: null, clientId: "c1", occasion: "Годовщина", date: "15 ноября 2026 г.", year: 2026, recipient: "мамы", client: { occasion: "Годовщина", date: "15 ноября 2026 г." } };
    const { engine, log } = setup([year], { subject: { deal: null }, scheduled: { anniversaries: async () => [row] } });
    await engine.runScheduled({ force: true });
    expect(log.filter((l) => l.startsWith("deal:") || l.startsWith("task:"))).toEqual(["deal:repeat:Годовщина: книга для мамы:year", "task:Предложить книгу для мамы:null"]);
    const field = setup([rule({ actions: [{ type: "create_task", title: "Книга для {получатель}" }] })], { subject: { deal: { id: "d1", number: 5, title: "Заявка", assigneeId: null, orderId: null, clientId: "c1", customFields: { recipient: "папы" } } } });
    await field.engine.run("deal.created", { subject: "d1" });
    expect(field.log[0]).toBe("task:Книга для папы:null");
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

describe("Статус заказа и трек-номер для правил (automation-2, automation-11, automation-d12)", () => {
  /** Заказ, оплаченный и переданный в печать: дальше — «Отправлен» и трек-номер. */
  async function inProduction() {
    const t = orderingSetup();
    const o = await t.place();
    await t.svc.confirmPayment({ orderId: o.id, paymentId: null }, orderingAdmin);
    await t.svc.changeStatus({ orderId: o.id, to: "in_production" }, orderingAdmin);
    t.uow.published.length = 0;
    const tracking = () => t.uow.published.filter((e) => e.type === "ordering.tracking_added").map((e) => e.payload as { trackingNumber: string; afterShipping: boolean });
    return { ...t, id: o.id, tracking };
  }

  it("трек, вписанный после перевода в «Отправлен», — событие «трек-номер появился»; тот же трек ещё раз — без события", async () => {
    const t = await inProduction();
    await t.svc.update({ orderId: t.id, status: "shipped", trackingNumber: "" }, orderingAdmin);
    expect(t.tracking()).toEqual([]);
    await t.svc.update({ orderId: t.id, status: "shipped", trackingNumber: " RR123456789KZ " }, orderingAdmin);
    expect(t.tracking()).toEqual([expect.objectContaining({ trackingNumber: "RR123456789KZ", afterShipping: true })]);
    await t.svc.update({ orderId: t.id, status: "shipped", trackingNumber: "RR123456789KZ" }, orderingAdmin);
    expect(t.tracking()).toHaveLength(1);
    // Исправили опечатку — новый трек, новое событие.
    await t.svc.update({ orderId: t.id, status: "shipped", trackingNumber: "RR123456780KZ" }, orderingAdmin);
    expect(t.tracking().map((p) => p.trackingNumber)).toEqual(["RR123456789KZ", "RR123456780KZ"]);
  });

  it("трек вписали в печати — событие при переводе в «Отправлен» (письмо «Книга в пути» уже с треком: afterShipping = false)", async () => {
    const t = await inProduction();
    await t.svc.update({ orderId: t.id, status: "in_production", trackingNumber: "RR123456789KZ" }, orderingAdmin);
    expect(t.tracking()).toEqual([]);
    await t.svc.update({ orderId: t.id, status: "shipped", trackingNumber: "RR123456789KZ" }, orderingAdmin);
    expect(t.tracking()).toEqual([expect.objectContaining({ trackingNumber: "RR123456789KZ", afterShipping: false })]);
    // Статус и трек одной формой — тоже одно событие.
    const both = await inProduction();
    await both.svc.update({ orderId: both.id, status: "shipped", trackingNumber: "CDEK-1029384756" }, orderingAdmin);
    expect(both.tracking()).toEqual([expect.objectContaining({ trackingNumber: "CDEK-1029384756", afterShipping: false })]);
  });

  it("события заказа запускают правила со сделкой заказа: статус — один раз на статус, трек — один раз на номер", async () => {
    const { registerSubscriptions } = await import("@/server/subscriptions");
    const bus = new InProcessEventBus({ info: () => {}, warn: () => {}, error: () => {} });
    const runs: [string, unknown][] = [];
    registerSubscriptions({ bus, automation: { engine: { run: async (trigger: string, ctx: unknown) => void runs.push([trigger, ctx]) } }, sales: { deals: { byOrder: async () => [{ id: "deal-7" }] } } } as never);
    const t = await inProduction();
    await t.svc.update({ orderId: t.id, status: "shipped", trackingNumber: "RR123456789KZ" }, orderingAdmin);
    await bus.publish(t.uow.published);
    expect(runs).toEqual([
      ["order.status_changed", { subject: `order:status:${t.id}:shipped`, orderId: t.id, clientId: "user-1", dealId: "deal-7", orderStatus: "shipped" }],
      ["order.tracking_added", { subject: `order:track:${t.id}:RR123456789KZ`, orderId: t.id, clientId: "user-1", dealId: "deal-7" }],
    ]);
  });

  it("условие «статус»: правило на «Отправлен» не срабатывает на «В печати»; откат и повторный перевод клиенту не повторяются", async () => {
    const shipped = rule({ id: "ship", name: "Отправлена", trigger: "order.status_changed", conditions: { orderStatus: "shipped" }, actions: [{ type: "send_message", text: "Книга отправлена" }] });
    const { engine, log } = setup([shipped]);
    await engine.run("order.status_changed", { subject: "order:status:o1:in_production", orderId: "o1", orderStatus: "in_production" });
    expect(log).toEqual([]);
    await engine.run("order.status_changed", { subject: "order:status:o1:shipped", orderId: "o1", orderStatus: "shipped" });
    await engine.run("order.status_changed", { subject: "order:status:o1:shipped", orderId: "o1", orderStatus: "shipped" });
    expect(log).toEqual(["msg:conv1:Книга отправлена (Отправлена, о заказе)", "run:ship"]);
  });

  it("сообщение о заказе — только в переписку WhatsApp: её нет — не уходит, в сделку заметка; трек передаётся как разрешённый", async () => {
    const track = rule({ id: "track", name: "Отправлена + трек", trigger: "order.tracking_added", actions: [{ type: "send_message", text: "Трек: {трек}" }, { type: "notify", title: "Трек ушёл" }] });
    const none = setup([track], { whatsapp: null, subject: { trackingNumber: "RR123456789KZ" } });
    await none.engine.run("order.tracking_added", { subject: "order:track:o1:RR123456789KZ", orderId: "o1", dealId: "d1" });
    expect(none.log).toEqual([
      "note:d1:Правило «Отправлена + трек» не отправило клиенту сообщение: с ним нет переписки в WhatsApp, а первым на новый номер CRM не пишет. Если нужно — напишите клиенту сами; письмо о заказе уходит, если у клиента настоящая почта.",
      "notify:staff:Трек ушёл",
      "run:track",
    ]);
    const wa = setup([track], { whatsapp: "wa-7", subject: { trackingNumber: "RR123456789KZ" } });
    await wa.engine.run("order.tracking_added", { subject: "order:track:o1:RR123456789KZ", orderId: "o1" });
    expect(wa.log[0]).toBe("msg:wa-7:Трек: RR123456789KZ (Отправлена + трек, о заказе, можно: RR123456789KZ)");
    // Без сделки заметку писать некуда — только лог; остальные правила — как раньше, в последний диалог.
    const noDeal = setup([track], { whatsapp: null, subject: { deal: null } });
    await noDeal.engine.run("order.tracking_added", { subject: "x" });
    expect(noDeal.log.filter((l) => l.startsWith("note:") || l.startsWith("msg:"))).toEqual([]);
  });

  it("{трек}, {ссылка_на_заказ}, {ссылка_на_книгу}, {ссылка_на_оплату}; {ссылка} — заказ, иначе книга, иначе сайт", async () => {
    const text = "{имя}, трек {трек}: {ссылка_на_заказ} · книга {ссылка_на_книгу} · оплата {ссылка_на_оплату} · {ссылка}";
    const track = rule({ id: "track", name: "Трек", trigger: "order.tracking_added", actions: [{ type: "send_message", text }] });
    const links = { order: "https://mybook.kz/kk/orders/o1", book: "https://mybook.kz/kk/books/b1", pay: null };
    const withOrder = setup([track], { subject: { trackingNumber: "RR123456789KZ", links } });
    await withOrder.engine.run("order.tracking_added", { subject: "order:track:o1:RR123456789KZ", orderId: "o1" });
    expect(withOrder.log[0]).toBe("msg:conv1:Айгерим, трек RR123456789KZ: https://mybook.kz/kk/orders/o1 · книга https://mybook.kz/kk/books/b1 · оплата · https://mybook.kz/kk/orders/o1 (Трек, о заказе, можно: RR123456789KZ)");
    const bookOnly = setup([rule({ ...track, actions: [{ type: "send_message", text: "{ссылка}" }] })], { subject: { links: { order: null, book: "https://mybook.kz/books/b1", pay: "https://mybook.kz/pay/t" } } });
    await bookOnly.engine.run("order.tracking_added", { subject: "x" });
    expect(bookOnly.log[0]).toBe("msg:conv1:https://mybook.kz/books/b1 (Трек, о заказе)");
    const none = setup([rule({ ...track, actions: [{ type: "send_message", text: "{ссылка} {трек}" }] })]);
    await none.engine.run("order.tracking_added", { subject: "x" });
    expect(none.log[0]).toBe("msg:conv1:https://mybook.kz (Трек, о заказе)");
  });
});

describe("Стартовые правила о статусе заказа и подпись в карточке заказа (chats-15, automation-d8)", () => {
  const sql = readFileSync(path.resolve(import.meta.dirname, "../drizzle/0052_order_status_rules.sql"), "utf8");
  const seeded = [...sql.matchAll(/SELECT '([^']+)', '([\w.]+)', '([^']*)'::jsonb,\s*'([\s\S]*?)'::jsonb,\s*(true|false)\s*WHERE NOT EXISTS \(SELECT 1 FROM "crm_automations" WHERE "trigger" = '([\w.]+)'\)/g)].map(
    ([, name, trigger, conditions, actions, active, guard]) => ({ name, trigger, conditions: JSON.parse(conditions) as Record<string, string>, actions: JSON.parse(actions) as RuleAction[], active: active === "true", guard }),
  );

  it("миграция: «в печати» и «отправлена + трек» приезжают выключенными, с текстами на русском и казахском", () => {
    expect(seeded.map((r) => [r.trigger, r.conditions, r.active])).toEqual([
      ["order.status_changed", { orderStatus: "in_production" }, false],
      ["order.tracking_added", {}, false],
    ]);
    for (const r of seeded) {
      expect(isTrigger(r.trigger)).toBe(true);
      expect(r.guard).toBe(r.trigger);
      // Условия — те, что сохранил бы редактор.
      expect(relevantConditions(r.trigger, r.conditions)).toEqual(r.conditions);
      expect(r.actions).toEqual([{ type: "send_message", text: expect.stringContaining("{ссылка_на_заказ}"), textKk: expect.stringContaining("{ссылка_на_заказ}") }]);
    }
  });

  it("стартовые правила: русскому клиенту — русский текст, казахскому — казахский; переменные подставлены, реквизитов нет", async () => {
    const order = "https://mybooks.kz/orders/5d1c9e2a-4b3f-4c6d-8e9f-a7012345678b";
    const subject = { orderNumber: 42, trackingNumber: "7012345678", links: { order, book: null, pay: null } };
    const sent: string[] = [];
    for (const locale of ["ru", "kk"] as const) {
      const rules = seeded.map((r, i) => rule({ id: `s${i}`, name: r.name, trigger: r.trigger, conditions: r.conditions, actions: r.actions }));
      const { engine, log } = setup(rules, { subject: { ...subject, locale, links: { ...subject.links, order: locale === "kk" ? order.replace("/orders", "/kk/orders") : order } } });
      await engine.run("order.status_changed", { subject: "order:status:o1:in_production", orderId: "o1", orderStatus: "in_production" });
      await engine.run("order.tracking_added", { subject: "order:track:o1:7012345678", orderId: "o1" });
      sent.push(...log.filter((l) => l.startsWith("msg:")));
    }
    expect(sent).toEqual([
      "msg:conv1:Здравствуйте, Айгерим! Ваша книга по заказу №42 ушла в печать. Обычно это занимает несколько рабочих дней. Как только отправим, пришлём трек-номер. Заказ: https://mybooks.kz/orders/5d1c9e2a-4b3f-4c6d-8e9f-a7012345678b (Книга в печати → сообщение клиенту, о заказе, можно: 7012345678)",
      "msg:conv1:Здравствуйте, Айгерим! Ваша книга по заказу №42 напечатана и отправлена. Трек-номер: 7012345678. Отследить и посмотреть заказ: https://mybooks.kz/orders/5d1c9e2a-4b3f-4c6d-8e9f-a7012345678b (Книга отправлена + трек-номер → сообщение клиенту, о заказе, можно: 7012345678)",
      "msg:conv1:Сәлеметсіз бе, Айгерим! №42 тапсырыс бойынша кітабыңыз баспаға жіберілді. Әдетте бұл бірнеше жұмыс күнін алады. Жібергеннен кейін трек-нөмірін жолдаймыз. Тапсырыс: https://mybooks.kz/kk/orders/5d1c9e2a-4b3f-4c6d-8e9f-a7012345678b (Книга в печати → сообщение клиенту, о заказе, можно: 7012345678)",
      "msg:conv1:Сәлеметсіз бе, Айгерим! №42 тапсырыс бойынша кітабыңыз басылып, жеткізуге берілді. Трек-нөмір: 7012345678. Тапсырысты бақылау: https://mybooks.kz/kk/orders/5d1c9e2a-4b3f-4c6d-8e9f-a7012345678b (Книга отправлена + трек-номер → сообщение клиенту, о заказе, можно: 7012345678)",
    ]);
    // Ссылка и трек (с разрешением, которое передаёт правило) проверку реквизитов проходят.
    for (const m of sent) expect(findSensitive(m.replace(/ \(Книга[^)]*\)$/, ""), ["7012345678"])).toEqual([]);
  });

  const facts = (p: Partial<OrderNoticeFacts> = {}): OrderNoticeFacts => ({
    realEmail: true,
    rules: seeded.map((r) => ({ trigger: r.trigger, orderStatus: r.conditions.orderStatus ?? null })),
    whatsappChat: true,
    noMarketing: false,
    ...p,
  });

  it("подпись: что реально уйдёт — письмо, если почта настоящая, и WhatsApp, если правило включено и есть переписка", () => {
    expect(orderNotice(facts(), "paid", "in_production")).toEqual({ text: "Клиент получит письмо и сообщение в WhatsApp («В производстве»).", warn: false });
    expect(orderNotice(facts({ realEmail: false }), "in_production", "shipped")).toEqual({ text: "Клиент получит сообщение в WhatsApp (трек-номер, если он вписан). Письма не будет — у клиента нет почты.", warn: false });
    expect(orderNotice(facts({ whatsappChat: false }), "paid", "in_production")).toEqual({ text: "Клиент получит письмо. В WhatsApp не уйдёт: с клиентом нет переписки в WhatsApp, а первым CRM не пишет.", warn: false });
    // Клиент из WhatsApp без почты, правила выключены — не узнает ничего: менеджеру написать самому.
    expect(orderNotice(facts({ realEmail: false, rules: [] }), "paid", "in_production")).toEqual({ text: "Клиент ничего не получит: у клиента нет почты, в WhatsApp — правило о таком статусе выключено («Автоматизации»). Напишите ему сами.", warn: true });
    expect(orderNotice(facts({ realEmail: false, noMarketing: true }), "in_production", "shipped")).toEqual({ text: "Клиент ничего не получит: у клиента нет почты, в WhatsApp — клиент просил не писать первым. Напишите ему сами.", warn: true });
    expect(orderNotice(facts({ realEmail: false }), "shipped", "cancelled")).toEqual({ text: "Клиент ничего не получит: у клиента нет почты, в WhatsApp — об отмене правила не пишут. Напишите ему сами.", warn: true });
  });

  it("подпись: статус тот же — ничего; у отправленного — куда уйдёт новый трек-номер", () => {
    expect(orderNotice(facts(), "in_production", "in_production")).toEqual({ text: "Статус тот же — клиенту ничего не уйдёт.", warn: false });
    expect(orderNotice(facts(), "shipped", "shipped")).toEqual({ text: "Новый трек-номер клиент получит письмом и в WhatsApp.", warn: false });
    expect(orderNotice(facts({ realEmail: false, whatsappChat: false }), "shipped", "shipped").warn).toBe(true);
  });
});
