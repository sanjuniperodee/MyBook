import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AutomationEngine, type AutomationEffects, type RuleRepository, type SalesGateway, type ScheduledSource, type SubjectLoader } from "@/modules/automation/application";
import { isTrigger } from "@/modules/automation/domain/meta";
import {
  ANNIVERSARY_LIMITS,
  anniversaryQuery,
  DEFAULT_HOLIDAYS,
  EVENT_DATE_LIMITS,
  eventDateQuery,
  eventDateSubject,
  IDLE_LIMITS,
  idleQuery,
  idleSubject,
  relevantConditions,
  SILENT_LIMITS,
  silentQuery,
  silentSubject,
  type AutomationRule,
  type Holiday,
  type RuleAction,
  type RuleSubject,
  waitsForMessaging,
} from "@/modules/automation/domain";
import { findSensitive } from "@/modules/messaging/domain/sensitive";
import { orderNotice, type OrderNoticeFacts } from "@/modules/ordering/ui/notice";
import { orderRuleSubject, type OrderStatus } from "@/shared/domain/orders";
import { addWorkMinutes, nextWorkStart, parseWorkHours } from "@/shared/domain/schedule";
import { InProcessEventBus } from "@/shared/infrastructure/InProcessEventBus";
import { inbound, setup as chatSetup } from "./doubles/botHarness";
import { setup as clientsSetup, lead as crmLead, manager as crmManager } from "./doubles/clients";
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
    /** Отправка после записи в лог — например, настоящий sendAutomated из botHarness. */
    sendMessage?: AutomationEffects["sendMessage"];
    /** Рабочих минут, сколько клиент ждёт ответа («клиенту не ответили»). */
    workMinutes?: number;
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
    sendMessage: async (id, text, o) => {
      log.push(`msg:${id}:${text}${o ? ` (${o.rule}${o.reply ? ", ответ" : ""}${o.transactional ? ", о заказе" : ""}${o.allow?.length ? `, можно: ${o.allow.join(" ")}` : ""})` : ""}`);
      await opts.sendMessage?.(id, text, o);
    },
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
  const scheduled: ScheduledSource = { unanswered: async () => [], inactiveClients: async () => [], anniversaries: async () => [], holidayBuyers: async () => [], eventDates: async () => [], idleDeals: async () => [], silent: async () => [], firedOn: async () => 0, ...opts.scheduled };
  // График по умолчанию — каждый день 09:00–21:00 по Алматы (UTC+5).
  const hours = parseWorkHours(null);
  const schedule = {
    isWorkTime: async () => opts.workTime ?? true,
    nextWorkStart: async (at: Date) => nextWorkStart(at, hours, "Asia/Almaty"),
    workMinutesBetween: async () => opts.workMinutes ?? 0,
    addWorkMinutes: async (from: Date, min: number) => addWorkMinutes(from, min, hours, "Asia/Almaty"),
  };
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
          anniversaries: async (ruleId, today, daysBefore, repurchaseDays) => (asked.push(`anniversary:${ruleId}:${today}:${daysBefore}:${repurchaseDays}`), []),
        },
      },
    );
    expect(await engine.runScheduled({ force: true })).toBe(2);
    expect(asked).toEqual(["unanswered:sla:2026-10-01T05:30:00.000Z", "inactive:back-5:5", "inactive:back-10:10", "anniversary:year:2026-10-01:30:60"]);
  });
});

describe("Годовщина: «уже купил снова» — только к этой годовщине (automation-d6)", () => {
  it("покупка не раньше чем за daysBefore + windowDays дней до годовщины — уже покупка к ней; по умолчанию 30 + 30, как сезон праздника", () => {
    expect(anniversaryQuery({ conditions: {} })).toEqual({ daysBefore: 30, repurchaseDays: 60 });
    // Правило с прода (миграция 0014) — только daysBefore: окно по умолчанию.
    expect(anniversaryQuery({ conditions: { daysBefore: 45 } })).toEqual({ daysBefore: 45, repurchaseDays: 75 });
    expect(anniversaryQuery({ conditions: { daysBefore: 14, windowDays: 21 } })).toEqual({ daysBefore: 14, repurchaseDays: 35 });
    expect(anniversaryQuery({ conditions: { daysBefore: 500, windowDays: 500 } })).toEqual({ daysBefore: ANNIVERSARY_LIMITS.daysBefore, repurchaseDays: ANNIVERSARY_LIMITS.daysBefore + ANNIVERSARY_LIMITS.windowDays });
    expect(anniversaryQuery({ conditions: { daysBefore: "abc", windowDays: 0 } })).toEqual({ daysBefore: 30, repurchaseDays: 60 });
  });

  it("окно настраивается в правиле: редактор сохраняет дни до даты и окно, лишние условия отбрасывает", () => {
    expect(relevantConditions("occasion.anniversary", {})).toEqual({ daysBefore: 30, windowDays: 30 });
    expect(relevantConditions("occasion.anniversary", { daysBefore: 45, windowDays: 20, perDay: 5, holiday: "newyear" })).toEqual({ daysBefore: 45, windowDays: 20 });
    expect(relevantConditions("occasion.anniversary", { daysBefore: 500, windowDays: 500 })).toEqual({ daysBefore: ANNIVERSARY_LIMITS.daysBefore, windowDays: ANNIVERSARY_LIMITS.windowDays });
  });

  it("окно из условия правила уходит в выборку", async () => {
    const asked: number[][] = [];
    const year = rule({ id: "year", trigger: "occasion.anniversary", conditions: { daysBefore: 20, windowDays: 40 }, actions: [{ type: "notify" }] });
    const { engine } = setup([year], { scheduled: { anniversaries: async (_r, _t, daysBefore, repurchaseDays) => (asked.push([daysBefore, repurchaseDays]), []) } });
    await engine.runScheduled({ force: true });
    expect(asked).toEqual([[20, 60]]);
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

  it("ночью годовщины не выбираются: сделка и задача остались бы ничьими (круг ночью не раздаёт) — сработают в начале смены", async () => {
    let asked = 0;
    const anniversaries = async () => (asked++, [kk]);
    const night = setup([year], { workTime: false, subject: { deal: null }, scheduled: { anniversaries } });
    expect(await night.engine.runScheduled({ force: true })).toBe(0);
    expect(asked).toBe(0);
    expect(night.log).toEqual([]);
    const day = setup([year], { workTime: true, subject: { deal: null }, scheduled: { anniversaries } });
    expect(await day.engine.runScheduled({ force: true })).toBe(1);
    expect(asked).toBe(1);
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

  it("«клиенту не ответили» с сообщением при исчерпанном лимите не ждёт: уведомление сразу, объект застолблен, сообщение решает sendAutomated", async () => {
    const sla = rule({
      id: "sla",
      name: "Не ответили 15 минут",
      trigger: "message.unanswered",
      conditions: { minutes: 15 },
      actions: [{ type: "notify", title: "Клиенту не ответили" }, { type: "create_task", title: "Ответить {имя}" }, { type: "send_message", text: "Минутку, менеджер скоро ответит" }],
    });
    const waiting = { conversationId: "conv1", dealId: "d1", clientId: "c1", channel: "whatsapp", awaitingSince: new Date("2026-10-01T05:40:00Z") };
    const { engine, log } = setup([sla], { workMinutes: 20, canMessage: () => false, scheduled: { unanswered: async () => [waiting] } });
    expect(await engine.runScheduled()).toBe(1);
    expect(log).toEqual(["notify:staff:Клиенту не ответили", "task:Ответить Айгерим:null", "notify:staff:Задача: Ответить Айгерим", "msg:conv1:Минутку, менеджер скоро ответит (Не ответили 15 минут)", "run:sla"]);
    // Застолблено: следующий проход то же ожидание не повторяет.
    expect(await engine.runScheduled()).toBe(0);
  });

  it("лимит выбран автоответами — «не ответили» всё равно уведомляет, сообщение не уходит, в сделке заметка", async () => {
    const chat = chatSetup({ ruleSending: { from: "09:00", to: "21:00", dailyLimit: 1 } });
    await chat.service.ingest(inbound({ text: "Здравствуйте" }));
    const id = chat.conv().id;
    chat.setNow(new Date("2026-10-01T06:00:00Z")); // 11:00 по Алматы — окно открыто
    expect(await chat.service.sendAutomated(id, "Ответим утром", { rule: "Автоответ", reply: true })).toMatchObject({ status: "sent" });
    const sla = rule({ id: "sla", name: "Не ответили 15 минут", trigger: "message.unanswered", actions: [{ type: "notify", title: "Клиенту не ответили" }, { type: "send_message", text: "Минутку, менеджер скоро ответит" }] });
    const waiting = { conversationId: id, dealId: chat.conv().dealId, clientId: null, channel: "whatsapp", awaitingSince: new Date("2026-10-01T05:40:00Z") };
    const { engine, log } = setup([sla], {
      workMinutes: 20,
      canMessage: () => false,
      subject: { conversation: { id, assigneeId: null, contactName: "Айгерим", lastMessageText: "Здравствуйте", clientId: null } },
      sendMessage: async (convId, text, o) => void (await chat.service.sendAutomated(convId, text, o)),
      scheduled: { unanswered: async () => [waiting] },
    });
    expect(await engine.runScheduled()).toBe(1);
    expect(log).toContain("notify:staff:Клиенту не ответили");
    expect(chat.sent).toEqual(["Ответим утром"]);
    expect(chat.notes.at(-1)).toContain("Правило «Не ответили 15 минут» не отправило клиенту сообщение: лимит 1 сообщений от правил в сутки исчерпан.");
  });

  it("«дата события» с задачей и сообщением при закрытом окне: задача сразу, окно не спрашивается", async () => {
    const soon = rule({ id: "soon", trigger: "deal.event_date_near", conditions: { daysBefore: 10 }, actions: [{ type: "create_task", title: "Успеть к {дата}" }, { type: "send_message", text: "{имя}, до {дата} немного" }] });
    const row = { dealId: "d1", clientId: "c1", eventDate: "2026-10-05", occasion: "День рождения", date: "5 октября 2026 г.", client: { occasion: "День рождения", date: "5 октября 2026 г." } };
    const { engine, log } = setup([soon], { canMessage: () => false, scheduled: { eventDates: async () => [row] } });
    expect(await engine.runScheduled({ force: true })).toBe(1);
    expect(log).not.toContain("gate");
    expect(log.filter((l) => l.startsWith("task:") || l.startsWith("msg:"))).toEqual(["task:Успеть к 5 октября 2026 г.:null", "msg:conv1:Айгерим, до 5 октября 2026 г. немного (Правило)"]);
  });

  it("окна и лимита ждут только правила, где сообщение — суть: «забросил книгу», годовщина, праздник", async () => {
    const msg: RuleAction[] = [{ type: "send_message", text: "Текст" }];
    const triggers = ["client.inactive", "occasion.anniversary", "occasion.holiday", "message.unanswered", "deal.event_date_near", "deal.idle", "message.silent"];
    expect(triggers.filter((trigger) => waitsForMessaging({ trigger, actions: msg }))).toEqual(["client.inactive", "occasion.anniversary", "occasion.holiday"]);
    expect(waitsForMessaging({ trigger: "client.inactive", actions: [{ type: "create_task", title: "Вернуть" }] })).toBe(false);
    const year = rule({ id: "year", trigger: "occasion.anniversary", actions: [{ type: "create_task", title: "Годовщина" }, { type: "send_message", text: "Скоро годовщина" }] });
    const row = { orderId: "o1", dealId: null, clientId: "c1", occasion: "Годовщина", date: "15 октября 2026 г.", year: 2026, recipient: "", client: { occasion: "Годовщина", date: "15 октября 2026 г." } };
    const closed = setup([year], { canMessage: () => false, scheduled: { anniversaries: async () => [row] } });
    expect(await closed.engine.runScheduled({ force: true })).toBe(0);
    expect(closed.log).toEqual(["gate"]);
    expect([...closed.claimed]).toEqual([]);
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

  it("ручные «Написать» сотрудников — отложенное дело и задача коллеге — ответ в чате не закрывает, только задачи CRM", async () => {
    const crm = clientsSetup();
    const chat = chatSetup({ answeredTasks: { answered: (dealId) => crm.tasks.closeAnswered(dealId) } });
    await chat.service.ingest(inbound({ externalId: "in-1", text: "Здравствуйте, сколько стоит?" }));
    const dealId = chat.conv().dealId!;
    await crm.tasks.create(crmManager, { title: "Написать: напомнить про дату события", kind: "message", dueAt: "2026-10-25", dealId });
    await crm.tasks.create(crmLead, { title: "Написать: прислать макет", kind: "message", dueAt: "2026-10-02T12:00", dealId, assigneeId: "m1" });
    await crm.tasks.createSystem({ title: "Ответить: Айгерим (бот)", kind: "message", dueAt: new Date("2026-10-01T06:15:00Z"), dealId, assigneeId: "m1" });
    const state = () => [...crm.mem.tasks.rows.values()].map((t) => [t.title, t.doneAt ? "закрыта" : "открыта", t.result ?? null]);
    // Ответ на другой вопрос — с телефона магазина (эхо) и из CRM.
    await chat.service.ingest(inbound({ externalId: "phone-1", isEcho: true, text: "Добрый день! 15 000 ₸", contactName: "" }));
    await chat.service.send(chat.conv().id, "Подскажу по срокам", "m1");
    expect(state()).toEqual([
      ["Написать: напомнить про дату события", "открыта", null],
      ["Написать: прислать макет", "открыта", null],
      ["Ответить: Айгерим (бот)", "закрыта", "ответили в чате"],
    ]);
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
    // Тот же формат читает подпись в карточке заказа (reporting.orderNotice): о чём правило уже писало.
    expect(runs.map(([, ctx]) => (ctx as { subject: string }).subject)).toEqual([orderRuleSubject.status(t.id, "shipped"), orderRuleSubject.track(t.id, "RR123456789KZ")]);
  });

  it("откат статуса (в «Оплачен», в «Ждёт оплаты») и трек у доставленного заказа правилам о заказе не сообщаются", async () => {
    const { registerSubscriptions } = await import("@/server/subscriptions");
    const bus = new InProcessEventBus({ info: () => {}, warn: () => {}, error: () => {} });
    const runs: string[] = [];
    registerSubscriptions({ bus, automation: { engine: { run: async (trigger: string, ctx: { orderStatus?: string }) => void runs.push(`${trigger}:${ctx.orderStatus ?? ""}`) } }, sales: { deals: { byOrder: async () => [{ id: "deal-7" }] } } } as never);
    const t = await inProduction();
    // Ошиблись — вернули в «Оплачен»: правило «любой статус» не пишет клиенту «ваш заказ оплачен» второй раз.
    await t.svc.changeStatus({ orderId: t.id, to: "paid" }, orderingAdmin);
    await t.svc.changeStatus({ orderId: t.id, to: "in_production" }, orderingAdmin);
    await t.svc.update({ orderId: t.id, status: "delivered", trackingNumber: "" }, orderingAdmin);
    // Трек вписали уже после доставки — для истории: ни письма, ни правила.
    await t.svc.update({ orderId: t.id, status: "delivered", trackingNumber: "RR123456789KZ" }, orderingAdmin);
    expect(t.tracking()).toEqual([]);
    await bus.publish(t.uow.published);
    expect(runs).toEqual(["order.status_changed:in_production", "order.status_changed:delivered"]);
  });

  it("трек-номер из цифр — не «номер карты», когда он разрешён (сообщение о треке); чужой такой же длины — карта", () => {
    const track = "10293847561239"; // 14 цифр, проходит проверку Луна
    expect(findSensitive(`Трек-номер: ${track}`, [track])).toEqual([]);
    expect(findSensitive(`Трек-номер: ${track}`)).toEqual([{ kind: "card", value: "•••• 1239" }]);
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

  it("пропуск сообщения о заказе — заметкой в сделку заказа, а не в прошлую сделку, к которой привязана переписка", async () => {
    // Повторный клиент: переписка привязана к прошлогодней выигранной сделке, новый заказ завёл новую сделку.
    const chat = chatSetup();
    await chat.service.ingest(inbound());
    const conv = chat.conv();
    const oldDeal = conv.dealId!;
    chat.deals.push({ id: "deal-200", title: "Заказ №42", unsorted: false, fields: {}, tags: [] });
    chat.setNow(new Date("2026-10-01T21:30:00+05:00")); // 21:30 по Алматы — окно 09–21 закрыто
    const print = rule({ id: "print", name: "Книга в печати", trigger: "order.status_changed", conditions: { orderStatus: "in_production" }, actions: [{ type: "send_message", text: "Ваша книга в печати" }] });
    const sends: Parameters<AutomationEffects["sendMessage"]>[2][] = [];
    const { engine } = setup([print], {
      whatsapp: conv.id,
      sendMessage: async (convId, text, o) => void (sends.push(o), await chat.service.sendAutomated(convId, text, o)),
    });
    await engine.run("order.status_changed", { subject: "order:status:o1:in_production", orderId: "o1", dealId: "deal-200", orderStatus: "in_production" });
    expect(sends).toEqual([expect.objectContaining({ transactional: true, noteDealId: "deal-200" })]);
    expect(chat.sent).toEqual([]);
    expect(chat.dealNotes).toEqual([{ dealId: "deal-200", text: expect.stringContaining("Правило «Книга в печати» не отправило клиенту сообщение: вне окна 09:00–21:00 (Алматы).") }]);
    expect(chat.dealNotes.some((n) => n.dealId === oldDeal)).toBe(false);
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
    workTime: true,
    pause: null,
    ...p,
  });
  const change = (from: OrderStatus, to: OrderStatus, track: string | null = null, savedTrack: string | null = null) => ({ from, to, track, savedTrack });

  it("подпись: что реально уйдёт — письмо, если почта настоящая, и WhatsApp, если правило включено и есть переписка", () => {
    expect(orderNotice(facts(), change("paid", "in_production"))).toEqual({ text: "Клиент получит письмо и сообщение в WhatsApp («В производстве»).", warn: false });
    expect(orderNotice(facts({ realEmail: false }), change("in_production", "shipped", "RR123456789KZ"))).toEqual({ text: "Клиент получит сообщение в WhatsApp (трек-номер). Письма не будет — у клиента нет почты.", warn: false });
    expect(orderNotice(facts({ whatsappChat: false }), change("paid", "in_production"))).toEqual({ text: "Клиент получит письмо. В WhatsApp не уйдёт: с клиентом нет переписки в WhatsApp, а первым CRM не пишет.", warn: false });
    // Клиент из WhatsApp без почты, правила выключены — не узнает ничего: менеджеру написать самому.
    expect(orderNotice(facts({ realEmail: false, rules: [] }), change("paid", "in_production"))).toEqual({ text: "Клиент ничего не получит: у клиента нет почты, в WhatsApp — правило о таком статусе выключено («Автоматизации»). Напишите ему сами.", warn: true });
    expect(orderNotice(facts({ realEmail: false, noMarketing: true }), change("in_production", "shipped", "RR123456789KZ"))).toEqual({ text: "Клиент ничего не получит: у клиента нет почты, в WhatsApp — клиент просил не писать первым. Напишите ему сами.", warn: true });
    expect(orderNotice(facts({ realEmail: false }), change("shipped", "cancelled"))).toEqual({ text: "Клиент ничего не получит: у клиента нет почты, в WhatsApp — об отмене правила не пишут. Напишите ему сами.", warn: true });
    expect(orderNotice(facts({ realEmail: false }), change("in_production", "pending_payment"))).toEqual({ text: "Клиенту ничего не уйдёт.", warn: false });
  });

  it("подпись: «Отправлен» без трек-номера в поле формы — правило о треке не напишет; без почты — жёлтая", () => {
    // Курьер или самовывоз: трек не вписан, клиент из WhatsApp с почтой-заглушкой не узнает ничего.
    expect(orderNotice(facts({ realEmail: false }), change("in_production", "shipped"))).toEqual({
      text: "Клиент ничего не получит: у клиента нет почты, в WhatsApp — трек-номер не вписан, а без него правило о трек-номере не пишет. Напишите ему сами.",
      warn: true,
    });
    // Трек стёрли в поле — сохранённый не в счёт: форма сотрёт его.
    expect(orderNotice(facts({ realEmail: false }), change("in_production", "shipped", "  ", "RR123456789KZ")).warn).toBe(true);
    // Вписан раньше и остался в поле — уйдёт.
    expect(orderNotice(facts({ realEmail: false }), change("in_production", "shipped", "RR123456789KZ", "RR123456789KZ")).warn).toBe(false);
    // С почтой — письмо «Книга в пути» уйдёт, а в WhatsApp — нет, и это видно.
    expect(orderNotice(facts(), change("in_production", "shipped"))).toEqual({ text: "Клиент получит письмо. В WhatsApp не уйдёт: трек-номер не вписан, а без него правило о трек-номере не пишет.", warn: false });
  });

  it("подпись: вне окна или сверх суточного лимита — жёлтая «в WhatsApp не уйдёт», даже если уйдёт письмо", () => {
    const night = facts({ pause: "вне окна 09:00–21:00 (Алматы)" });
    expect(orderNotice(night, change("paid", "in_production"))).toEqual({
      text: "Клиент получит письмо. В WhatsApp не уйдёт: сейчас вне окна 09:00–21:00 (Алматы), правило сработает без сообщения и повторно его не отправит. Напишите ему сами или сохраните статус позже.",
      warn: true,
    });
    expect(orderNotice(facts({ realEmail: false, pause: "лимит 40 сообщений от правил в сутки исчерпан" }), change("in_production", "shipped", "RR123456789KZ"))).toEqual({
      text: "Клиент ничего не получит: у клиента нет почты, в WhatsApp — сейчас лимит 40 сообщений от правил в сутки исчерпан, правило сработает без сообщения и повторно его не отправит. Напишите ему сами или сохраните статус позже.",
      warn: true,
    });
    // Правилу и так нечего писать (статус без правила) — окно не упоминается.
    expect(orderNotice(night, change("shipped", "delivered"))).toEqual({ text: "Клиент получит письмо.", warn: false });
    // Стоп-лист важнее окна: позже тоже не уйдёт.
    expect(orderNotice(facts({ realEmail: false, noMarketing: true, pause: "вне окна 09:00–21:00 (Алматы)" }), change("paid", "in_production")).text).toContain("в WhatsApp — клиент просил не писать первым. Напишите ему сами.");
  });

  it("подпись: правило уже писало об этом статусе или треке (откат и повторный перевод) — не обещает; новый трек — обещает", () => {
    const [print, track] = facts().rules;
    const done = facts({ realEmail: false, rules: [{ ...print, done: ["in_production"] }, { ...track, done: ["RR123456789KZ"] }] });
    expect(orderNotice(done, change("shipped", "in_production", "RR123456789KZ", "RR123456789KZ"))).toEqual({
      text: "Клиент ничего не получит: у клиента нет почты, в WhatsApp — правило уже писало клиенту о статусе «В производстве» и повторно не отправит. Напишите ему сами.",
      warn: true,
    });
    expect(orderNotice(done, change("in_production", "shipped", "RR123456789KZ", "RR123456789KZ")).text).toContain("в WhatsApp — правило уже писало клиенту об этом трек-номере и повторно не отправит");
    // Исправили опечатку в треке — новый номер правило ещё не отправляло.
    expect(orderNotice(done, change("shipped", "shipped", "RR123456780KZ", "RR123456789KZ"))).toEqual({ text: "Клиент получит сообщение в WhatsApp (трек-номер). Письма не будет — у клиента нет почты.", warn: false });
    // Другое правило на тот же статус ещё не писало — уйдёт.
    const another = facts({ rules: [{ ...print, done: ["in_production"] }, { trigger: "order.status_changed", orderStatus: null }] });
    expect(orderNotice(another, change("shipped", "in_production")).text).toBe("Клиент получит письмо и сообщение в WhatsApp («В производстве»).");
    // «Заказ оплачен» уже писал этому заказу.
    const paid = facts({ realEmail: false, rules: [{ trigger: "order.paid", orderStatus: null, done: ["paid"] }] });
    expect(orderNotice(paid, change("pending_payment", "paid")).text).toContain("правило уже писало клиенту об оплате");
  });

  it("подпись: условие правила «только в рабочее время» вне рабочего — не обещает", () => {
    const [print] = facts().rules;
    const work = facts({ realEmail: false, rules: [{ ...print, hours: "work" }], workTime: false });
    expect(orderNotice(work, change("paid", "in_production"))).toEqual({
      text: "Клиент ничего не получит: у клиента нет почты, в WhatsApp — правило о статусе «В производстве» пишет только в рабочее время. Напишите ему сами.",
      warn: true,
    });
    expect(orderNotice({ ...work, workTime: true }, change("paid", "in_production")).warn).toBe(false);
    expect(orderNotice(facts({ realEmail: false, rules: [{ ...print, hours: "off" }] }), change("paid", "in_production")).text).toContain("пишет только вне рабочего времени");
  });

  it("подпись: статус тот же — ничего; у отправленного — уйдёт ли новый трек-номер из поля формы", () => {
    expect(orderNotice(facts(), change("in_production", "in_production", "RR123456789KZ"))).toEqual({ text: "Статус тот же — клиенту ничего не уйдёт.", warn: false });
    expect(orderNotice(facts(), change("shipped", "shipped", "RR123456789KZ", "RR123456789KZ"))).toEqual({ text: "Статус тот же — клиенту ничего не уйдёт.", warn: false });
    expect(orderNotice(facts(), change("shipped", "shipped", "RR123456789KZ"))).toEqual({ text: "Клиент получит письмо и сообщение в WhatsApp (трек-номер).", warn: false });
    expect(orderNotice(facts({ realEmail: false, whatsappChat: false }), change("shipped", "shipped", "RR123456789KZ")).warn).toBe(true);
    // Доставленному вписали трек — письма нет (OrderingMailer), правило о треке — напишет.
    expect(orderNotice(facts(), change("delivered", "delivered", "RR123456789KZ"))).toEqual({ text: "Клиент получит сообщение в WhatsApp (трек-номер).", warn: false });
  });
});

describe("«Успеть к дате»: до даты события N дней (deals-28, automation-5)", () => {
  const sql = readFileSync(path.resolve(import.meta.dirname, "../drizzle/0053_event_date_rule.sql"), "utf8");
  const [, name, trigger, conditions, actions, active] = sql.match(/SELECT '([^']+)', '([\w.]+)', '([^']*)'::jsonb,\s*'([\s\S]*?)'::jsonb,\s*(true|false)\s*WHERE NOT EXISTS/)!;
  const starter = rule({ id: "soon", name, trigger, conditions: JSON.parse(conditions), actions: JSON.parse(actions) as RuleAction[] });
  // 19.10.2026 10:00 по Алматы — рабочее время.
  const oct19 = new Date("2026-10-19T05:00:00Z");
  const row = (dealId: string, eventDate: string, locale: "ru" | "kk" = "ru") => ({
    dealId,
    clientId: "c1",
    eventDate,
    occasion: "День рождения",
    date: `${Number(eventDate.slice(8))} октября 2026 г.`,
    client: locale === "kk" ? { occasion: "Туған күн", date: `2026 жылғы ${Number(eventDate.slice(8))} қазан` } : { occasion: "День рождения", date: `${Number(eventDate.slice(8))} октября 2026 г.` },
  });

  it("стартовое правило приезжает выключенным: за 10 дней, ничего не оплачено, в рабочее время — только задача менеджеру, клиенту не пишет", () => {
    expect(active).toBe("false");
    expect(isTrigger(trigger)).toBe(true);
    expect(sql).toContain(`WHERE "trigger" = '${trigger}'`);
    expect(starter.conditions).toEqual({ daysBefore: 10, unpaid: 1, hours: "work" });
    // Условия — те, что сохранил бы редактор.
    expect(relevantConditions(trigger, starter.conditions)).toEqual(starter.conditions);
    expect(starter.actions.map((a) => a.type)).toEqual(["create_task"]);
  });

  it("дни — по Алматы: в 23:30 ещё 18-е, в 00:30 уже 19-е; условия правила уходят в выборку", async () => {
    const asked: unknown[] = [];
    const scheduled = { eventDates: async (ruleId: string, q: unknown) => (asked.push({ ruleId, ...(q as object) }), []) };
    const r = rule({ id: "soon", trigger: "deal.event_date_near", conditions: { daysBefore: 10, bookBelow: 50, unpaid: 1 }, actions: [{ type: "notify" }] });
    await setup([r], { now: new Date("2026-10-18T18:30:00Z"), scheduled }).engine.runScheduled({ force: true });
    await setup([r], { now: new Date("2026-10-18T19:30:00Z"), scheduled }).engine.runScheduled({ force: true });
    await setup([rule({ ...r, conditions: {} })], { now: oct19, scheduled }).engine.runScheduled({ force: true });
    expect(asked).toEqual([
      { ruleId: "soon", from: "2026-10-18", to: "2026-10-28", bookBelow: 50, unpaid: true },
      { ruleId: "soon", from: "2026-10-19", to: "2026-10-29", bookBelow: 50, unpaid: true },
      // Без условий: за 10 дней, книга и оплата не проверяются.
      { ruleId: "soon", from: "2026-10-19", to: "2026-10-29", bookBelow: null, unpaid: false },
    ]);
  });

  it("задача ответственному по сделке с датой события; один раз на сделку и дату — перенесли дату, сработает снова", async () => {
    let rows = [row("d1", "2026-10-25")];
    const { engine, log, claimed, loaded } = setup([starter], { now: oct19, subject: { assigneeId: "m1" }, scheduled: { eventDates: async () => rows } });
    expect(await engine.runScheduled({ force: true })).toBe(1);
    expect(loaded[0]).toMatchObject({ dealId: "d1", clientId: "c1", date: "25 октября 2026 г.", occasion: "День рождения" });
    expect(await engine.runScheduled({ force: true })).toBe(0);
    rows = [row("d1", "2026-10-27")];
    expect(await engine.runScheduled({ force: true })).toBe(1);
    expect([...claimed]).toEqual(["soon:deal:d1:event_date:2026-10-25", "soon:deal:d1:event_date:2026-10-27"]);
    expect(log.filter((l) => l.startsWith("task:"))).toEqual([
      "task:Успеть к 25 октября 2026 г.: по сделке ничего не оплачено — связаться с Айгерим:m1",
      "task:Успеть к 27 октября 2026 г.: по сделке ничего не оплачено — связаться с Айгерим:m1",
    ]);
    expect(eventDateSubject("d1", "2026-10-25")).toBe("deal:d1:event_date:2026-10-25");
  });

  it("«только в рабочее время»: ночью выборки нет, сделка не застолблена — сработает утром", async () => {
    let calls = 0;
    const scheduled = { eventDates: async () => (calls++, [row("d1", "2026-10-25")]) };
    const night = setup([starter], { now: oct19, workTime: false, scheduled });
    expect(await night.engine.runScheduled({ force: true })).toBe(0);
    expect(calls).toBe(0);
    expect([...night.claimed]).toEqual([]);
  });

  it("сообщение клиенту — обычное, не о заказе: в диалог, который ведёт бот, не уйдёт; казахскому клиенту — по-казахски с датой по-казахски", async () => {
    const remind = rule({
      id: "msg",
      trigger: "deal.event_date_near",
      conditions: { daysBefore: 10 },
      actions: [{ type: "send_message", text: "{имя}, до {дата} осталось немного", textKk: "{имя}, {дата} жақын қалды" }],
    });
    const { engine, log } = setup([remind], { now: oct19, subject: { locale: "kk" }, scheduled: { eventDates: async () => [row("d1", "2026-10-25", "kk")] } });
    await engine.runScheduled({ force: true });
    // Без пометки «о заказе»: sendAutomated не отправит его в диалог, который ведёт бот (у бота своё «впритык»). Окно и
    // лимит правило не ждёт (сообщение проверит sendAutomated) — «gate» не спрашивается.
    expect(log).toEqual(["msg:conv1:Айгерим, 2026 жылғы 25 қазан жақын қалды (Правило)", "run:msg"]);
  });

  it("условия редактора: дни — до 60, порог книги — 1…100% (иначе не проверяется), «не оплачено» — 1; чужие условия не сохраняются", () => {
    expect(relevantConditions("deal.event_date_near", { daysBefore: 90, bookBelow: 40, unpaid: 1, stageId: "s1", hours: "work" })).toEqual({ daysBefore: EVENT_DATE_LIMITS.daysBefore, bookBelow: 40, unpaid: 1, hours: "work" });
    expect(relevantConditions("deal.event_date_near", { bookBelow: 0, unpaid: 0 })).toEqual({ daysBefore: 10 });
    expect(relevantConditions("deal.event_date_near", { bookBelow: 101, unpaid: null })).toEqual({ daysBefore: 10 });
    expect(eventDateQuery({ conditions: { daysBefore: 500, bookBelow: 101 } }, "2026-12-30")).toEqual({ from: "2026-12-30", to: "2027-02-28", bookBelow: null, unpaid: false });
  });
});

describe("Забытая сделка: N дней без активности (automation-4, deals-21)", () => {
  const sql = readFileSync(path.resolve(import.meta.dirname, "../drizzle/0054_idle_deals.sql"), "utf8");
  const [, name, trigger, conditions, actions, active] = sql.match(/SELECT '([^']+)', '([\w.]+)', '([^']*)'::jsonb,\s*'([\s\S]*?)'::jsonb,\s*(true|false)\s*WHERE NOT EXISTS/)!;
  const starter = rule({ id: "idle", name, trigger, conditions: JSON.parse(conditions), actions: JSON.parse(actions) as RuleAction[] });
  // 19.10.2026 10:00 по Алматы — рабочее время.
  const oct19 = new Date("2026-10-19T05:00:00Z");
  const row = (dealId: string, lastActivity: string) => ({ dealId, clientId: "c1", stageId: "s1", lastActivity: new Date(lastActivity), date: "15 октября 2026 г." });

  it("стартовое правило приезжает выключенным: 3 дня, до 20 сделок в день, в рабочее время — только задача менеджеру, клиенту не пишет", () => {
    expect(active).toBe("false");
    expect(isTrigger(trigger)).toBe(true);
    expect(sql).toContain(`WHERE "trigger" = '${trigger}'`);
    expect(starter.conditions).toEqual({ days: 3, perDay: 20, hours: "work" });
    // Условия — те, что сохранил бы редактор.
    expect(relevantConditions(trigger, starter.conditions)).toEqual(starter.conditions);
    expect(starter.actions.map((a) => a.type)).toEqual(["create_task"]);
  });

  it("выборка: активность раньше now − N дней, этап из условия, лимит — сколько осталось на сегодня", async () => {
    const asked: unknown[] = [];
    const scheduled = { idleDeals: async (ruleId: string, q: unknown) => (asked.push({ ruleId, ...(q as object) }), []), firedOn: async () => 5 };
    await setup([rule({ ...starter, conditions: { days: 3, perDay: 20, stageId: "s2" } })], { now: oct19, scheduled }).engine.runScheduled({ force: true });
    expect(asked).toEqual([{ ruleId: "idle", before: new Date("2026-10-16T05:00:00Z"), stageId: "s2", limit: 15 }]);
    expect(idleQuery({ conditions: { days: 500, perDay: 0 } }, oct19)).toEqual({ before: new Date(oct19.getTime() - IDLE_LIMITS.days * 86_400_000), stageId: null, perDay: 20 });
  });

  it("сделка без активности N дней получает ровно одну задачу; снова что-то было и затихло — ещё одну", async () => {
    let rows = [row("d1", "2026-10-15T12:30:00.123Z")];
    const { engine, log, claimed, loaded } = setup([starter], { now: oct19, subject: { assigneeId: "m1" }, scheduled: { idleDeals: async () => rows } });
    expect(await engine.runScheduled({ force: true })).toBe(1);
    expect(loaded[0]).toMatchObject({ dealId: "d1", clientId: "c1", stageId: "s1", date: "15 октября 2026 г." });
    // Тот же проход ещё раз (выборка вернула ту же сделку — например, гонка двух процессов): вторая задача не ставится.
    expect(await engine.runScheduled({ force: true })).toBe(0);
    rows = [row("d1", "2026-10-16T09:00:00.000Z")];
    expect(await engine.runScheduled({ force: true })).toBe(1);
    expect([...claimed]).toEqual(["idle:deal:d1:idle:2026-10-15T12:30:00.123Z", "idle:deal:d1:idle:2026-10-16T09:00:00.000Z"]);
    expect(log.filter((l) => l.startsWith("task:"))).toEqual([
      "task:Связаться с Айгерим: по сделке ничего не происходит с 15 октября 2026 г.:m1",
      "task:Связаться с Айгерим: по сделке ничего не происходит с 15 октября 2026 г.:m1",
    ]);
    expect(idleSubject("d1", new Date("2026-10-15T12:30:00.123Z"))).toBe("deal:d1:idle:2026-10-15T12:30:00.123Z");
  });

  it("не больше perDay в день: сработавшие сегодня — из журнала; лимит выбран — выборки нет", async () => {
    let calls = 0;
    const today: string[] = [];
    const scheduled = {
      firedOn: async (_r: string, day: string) => (today.push(day), 19),
      idleDeals: async () => (calls++, [row("d1", "2026-10-10T00:00:00Z"), row("d2", "2026-10-09T00:00:00Z")]),
    };
    const { engine, log } = setup([starter], { now: oct19, scheduled });
    expect(await engine.runScheduled({ force: true })).toBe(1);
    expect(log.filter((l) => l.startsWith("task:"))).toHaveLength(1);
    expect(today).toEqual(["2026-10-19"]);
    const full = setup([starter], { now: oct19, scheduled: { ...scheduled, firedOn: async () => 20 } });
    expect(await full.engine.runScheduled({ force: true })).toBe(0);
    expect(calls).toBe(1);
  });

  it("«только в рабочее время»: ночью выборки нет, сделка не застолблена — сработает утром", async () => {
    let calls = 0;
    const night = setup([starter], { now: oct19, workTime: false, scheduled: { idleDeals: async () => (calls++, [row("d1", "2026-10-10T00:00:00Z")]) } });
    expect(await night.engine.runScheduled({ force: true })).toBe(0);
    expect(calls).toBe(0);
    expect([...night.claimed]).toEqual([]);
  });

  it("клиенту не пишет: сообщение в правиле (мимо редактора) не уходит, задача и уведомление — да; этап — условие правила", async () => {
    const r = rule({ id: "idle", trigger: "deal.idle", conditions: { days: 3 }, actions: [{ type: "send_message", text: "{имя}, вы где?" }, { type: "notify" }] });
    const { engine, log } = setup([r], { now: oct19, subject: { assigneeId: "m1" }, scheduled: { idleDeals: async () => [row("d1", "2026-10-10T00:00:00Z")] } });
    expect(await engine.runScheduled({ force: true })).toBe(1);
    expect(log.some((l) => l.startsWith("msg:"))).toBe(false);
    expect(log).toContain("notify:m1:Сделка без активности");
    expect(relevantConditions("deal.idle", { days: 500, perDay: 900, stageId: "s1", minutes: 5, hours: "work" })).toEqual({ days: IDLE_LIMITS.days, perDay: IDLE_LIMITS.perDay, stageId: "s1", hours: "work" });
    expect(relevantConditions("deal.idle", {})).toEqual({ days: 3, perDay: 20 });
  });
});

describe("Клиент молчит после нашего ответа (automation-6)", () => {
  const sql = readFileSync(path.resolve(import.meta.dirname, "../drizzle/0055_client_silent.sql"), "utf8");
  const [, name, trigger, conditions, actions, active] = sql.match(/SELECT '([^']+)', '([\w.]+)', '([^']*)'::jsonb,\s*'([\s\S]*?)'::jsonb,\s*(true|false)\s*WHERE NOT EXISTS/)!;
  const starter = rule({ id: "silent", name, trigger, conditions: JSON.parse(conditions), actions: JSON.parse(actions) as RuleAction[] });
  // 19.10.2026 10:00 по Алматы — рабочее время.
  const oct19 = new Date("2026-10-19T05:00:00Z");
  const row = (conversationId: string, at: string) => ({ conversationId, dealId: "d1", clientId: "c1", channel: "whatsapp", lastOutgoingAt: new Date(at), date: "18 октября 2026 г." });

  it("стартовое правило приезжает выключенным: сутки молчания, в рабочее время — только задача менеджеру, клиенту не пишет", () => {
    expect(active).toBe("false");
    expect(isTrigger(trigger)).toBe(true);
    expect(sql).toContain(`WHERE "trigger" = '${trigger}'`);
    expect(starter.conditions).toEqual({ silentHours: 24, hours: "work" });
    expect(relevantConditions(trigger, starter.conditions)).toEqual(starter.conditions);
    expect(starter.actions.map((a) => a.type)).toEqual(["create_task"]);
  });

  it("выборка: наш ответ не позже now − N часов и не раньше недели до этого; часы — 1…168, иначе сутки", async () => {
    const asked: unknown[] = [];
    const scheduled = { silent: async (ruleId: string, q: unknown) => (asked.push({ ruleId, ...(q as object) }), []) };
    await setup([rule({ ...starter, conditions: { silentHours: 6 } })], { now: oct19, scheduled }).engine.runScheduled({ force: true });
    expect(asked).toEqual([{ ruleId: "silent", before: new Date("2026-10-18T23:00:00Z"), since: new Date("2026-10-11T23:00:00Z") }]);
    expect(silentQuery({ conditions: { silentHours: 500 } }, oct19).before).toEqual(new Date(oct19.getTime() - SILENT_LIMITS.hours * 3_600_000));
    expect(silentQuery({ conditions: { silentHours: 0 } }, oct19).before).toEqual(new Date("2026-10-18T05:00:00Z"));
    expect(relevantConditions("message.silent", { silentHours: 900, minutes: 5, channel: "whatsapp" })).toEqual({ silentHours: SILENT_LIMITS.hours, channel: "whatsapp" });
  });

  it("задача «написать» ответственному — одна на наш ответ: повторный проход по тому же сообщению второй не ставит; ответили снова и клиент молчит — ещё одна", async () => {
    let rows = [row("conv7", "2026-10-18T04:00:00.250Z")];
    const { engine, log, claimed, tasks } = setup([starter], { now: oct19, subject: { assigneeId: "m1" }, scheduled: { silent: async () => rows } });
    expect(await engine.runScheduled({ force: true })).toBe(1);
    expect(await engine.runScheduled({ force: true })).toBe(0);
    rows = [row("conv7", "2026-10-18T06:30:00.000Z")];
    expect(await engine.runScheduled({ force: true })).toBe(1);
    expect([...claimed]).toEqual(["silent:conv:conv7:silent:2026-10-18T04:00:00.250Z", "silent:conv:conv7:silent:2026-10-18T06:30:00.000Z"]);
    // Задача «написать» по диалогу — её закроет ответ клиенту (из CRM или с телефона магазина).
    expect(tasks.map((t) => [t.kind, t.title, t.assigneeId, t.dealId])).toEqual([
      ["message", "Напомнить о себе: Айгерим молчит после нашего ответа", "m1", "d1"],
      ["message", "Напомнить о себе: Айгерим молчит после нашего ответа", "m1", "d1"],
    ]);
    expect(log.some((l) => l.startsWith("msg:"))).toBe(false);
    expect(silentSubject("conv7", new Date("2026-10-18T04:00:00.250Z"))).toBe("conv:conv7:silent:2026-10-18T04:00:00.250Z");
  });

  it("«только в рабочее время»: ночью выборки нет; сообщение клиенту в правиле (мимо редактора) не уходит", async () => {
    let calls = 0;
    const night = setup([starter], { now: oct19, workTime: false, scheduled: { silent: async () => (calls++, [row("conv7", "2026-10-18T04:00:00Z")]) } });
    expect(await night.engine.runScheduled({ force: true })).toBe(0);
    expect(calls).toBe(0);
    const r = rule({ id: "silent", trigger: "message.silent", conditions: {}, actions: [{ type: "send_message", text: "{имя}, вы тут?" }, { type: "notify" }] });
    const { engine, log } = setup([r], { now: oct19, subject: { assigneeId: "m1" }, scheduled: { silent: async () => [row("conv7", "2026-10-18T04:00:00Z")] } });
    expect(await engine.runScheduled({ force: true })).toBe(1);
    expect(log.some((l) => l.startsWith("msg:") || l === "gate")).toBe(false);
    expect(log).toContain("notify:m1:Клиент молчит после нашего ответа");
  });

  it("наш ответ — ответ человека: эхо с телефона магазина и ответ из CRM двигают его, бот и входящее — нет", async () => {
    const chat = chatSetup();
    await chat.service.ingest(inbound({ externalId: "in-1", text: "Сколько стоит книга?", at: new Date("2026-10-01T06:00:00Z") }));
    expect(chat.conv().lastOutgoingAt ?? null).toBeNull();
    await chat.service.send(chat.conv().id, "Здравствуйте! Я помощник", null, "bot");
    expect(chat.conv().lastOutgoingAt ?? null).toBeNull();
    await chat.service.ingest(inbound({ externalId: "phone-1", isEcho: true, text: "Добрый день! 15 000 ₸", contactName: "", at: new Date("2026-10-01T06:05:00Z") }));
    expect(chat.conv().lastOutgoingAt).toEqual(new Date("2026-10-01T06:05:00Z"));
    chat.setNow(new Date("2026-10-01T07:00:00Z"));
    await chat.service.send(chat.conv().id, "Подскажу по срокам", "m1");
    expect(chat.conv().lastOutgoingAt).toEqual(new Date("2026-10-01T07:00:00Z"));
    await chat.service.ingest(inbound({ externalId: "in-2", text: "Спасибо", at: new Date("2026-10-01T07:10:00Z") }));
    expect(chat.conv().lastOutgoingAt).toEqual(new Date("2026-10-01T07:00:00Z"));
  });
});
