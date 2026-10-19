/**
 * Бот пишет повторно в названное клиентом время (bots-5, P0-12): «после зарплаты», «в пятницу» — модель предлагает
 * дату, код проверяет (рабочее время, не дальше N дней, не позже даты события, не «не писать первым», лимит за беседу);
 * тёплому неоплатившему с датой — одно сообщение в последний день, когда ещё можно начать и успеть.
 */
import { describe, expect, it } from "vitest";
import { defaultBotConfig, type BotConfig } from "@/modules/messaging/domain/botConfig";
import { deadlinePlan, lastStartDay, newBotState, type BotEnv, type BotInput } from "@/modules/messaging/domain/botEngine";
import type { DealField } from "@/modules/messaging/domain/bot";
import { readBotTrace } from "@/modules/messaging/domain/botTrace";
import { traceNoteText } from "@/modules/messaging/ui/botTrace";
import { parseRemindAt, parseSellerDecision, readSellerAi, remindLabel, remindProblem, remindVerdict, resolveSellerTurn, sellerSchema, sellerSystemPrompt, sellerUserPrompt, type SellerDecision } from "@/modules/messaging/domain/botSeller";
import { parseBotConfig } from "@/modules/messaging/domain/botConfig";
import { workStartOn, type BotSellerModel } from "@/modules/messaging/application";
import { isWorkTime, nextWorkStart, type WorkHours } from "@/shared/domain/schedule";
import { BOT_CONFIG, inbound, setup } from "./doubles/botHarness";

const TZ = "Asia/Almaty";
const WEEKDAYS: WorkHours = { days: [1, 2, 3, 4, 5], from: "09:00", to: "21:00" };

// ─── чистые проверки ─────────────────────────────────────────────────────────

describe("Повторное сообщение: проверки кода", () => {
  const now = new Date("2026-10-01T06:00:00Z"); // четверг, 11:00 по Алматы
  const base = { now, tz: TZ, eventDate: null, maxDays: 60, touches: 0, maxTouches: 2, paid: false, noMarketing: false };
  const at = (iso: string) => new Date(iso);

  it("remind_at: день или день и время по Алматы; остальное — не дата", () => {
    expect(parseRemindAt("2026-10-12", TZ)).toEqual({ day: "2026-10-12", at: null });
    expect(parseRemindAt("2026-10-12T15:30", TZ)).toEqual({ day: "2026-10-12", at: at("2026-10-12T10:30:00Z") });
    expect(parseRemindAt("2026-10-12 15:30", TZ)?.at).toEqual(at("2026-10-12T10:30:00Z"));
    for (const bad of ["после зарплаты", "2026-02-30", "2026-10-12T25:00", "12.10.2026", ""]) expect(parseRemindAt(bad, TZ)).toBeNull();
  });

  it("границы: ровно maxDays — можно, на день дальше — нет; в день события — можно, после — нет; прошлое — нет", () => {
    expect(remindVerdict({ ...base, day: "2026-11-30", due: at("2026-11-30T04:00:00Z") })).toBeNull(); // +60 дней
    expect(remindVerdict({ ...base, day: "2026-12-01", due: at("2026-12-01T04:00:00Z") })).toBe("too_far");
    expect(remindVerdict({ ...base, maxDays: 10, day: "2026-10-12", due: at("2026-10-12T04:00:00Z") })).toBe("too_far");
    expect(remindVerdict({ ...base, eventDate: "2026-10-20", day: "2026-10-20", due: at("2026-10-20T04:00:00Z") })).toBeNull();
    expect(remindVerdict({ ...base, eventDate: "2026-10-20", day: "2026-10-21", due: at("2026-10-21T04:00:00Z") })).toBe("after_event");
    expect(remindVerdict({ ...base, day: "2026-09-30", due: at("2026-09-30T04:00:00Z") })).toBe("past");
    // Сегодня без времени — начало смены уже прошло; сегодня в 15:00 — можно.
    expect(remindVerdict({ ...base, day: "2026-10-01", due: at("2026-10-01T04:00:00Z") })).toBe("past");
    expect(remindVerdict({ ...base, day: "2026-10-01", due: at("2026-10-01T10:00:00Z") })).toBeNull();
  });

  it("нерабочее время, стоп-лист «не писать первым», уже платил, лимит за беседу — нельзя", () => {
    const ok = { ...base, day: "2026-10-12", due: at("2026-10-12T04:00:00Z") };
    expect(remindVerdict({ ...ok, due: null })).toBe("off_hours");
    expect(remindVerdict({ ...ok, noMarketing: true })).toBe("no_marketing");
    expect(remindVerdict({ ...ok, paid: true })).toBe("paid");
    expect(remindVerdict({ ...ok, touches: 2 })).toBe("limit");
    expect(remindVerdict({ ...ok, touches: 1 })).toBeNull();
    // Замечание модели: что сделать вместо этой даты.
    expect(remindProblem("off_hours", { maxDays: 60, eventDate: null }).detail).toContain("мы не работаем");
    expect(remindProblem("after_event", { maxDays: 60, eventDate: "2026-10-20" }).detail).toContain("20 октября");
    expect(remindProblem("no_marketing", { maxDays: 60, eventDate: null }).detail).toContain("не обещай написать");
  });

  it("только день — с начала смены; выходной — нет такого момента", async () => {
    const settings = { isWorkTime: async (d: Date) => isWorkTime(d, WEEKDAYS, TZ), nextWorkStart: async (d: Date) => nextWorkStart(d, WEEKDAYS, TZ) };
    expect(await workStartOn(settings, "2026-10-12", TZ)).toEqual(at("2026-10-12T04:00:00Z")); // понедельник, 09:00
    expect(await workStartOn(settings, "2026-10-10", TZ)).toBeNull(); // суббота
    const late = { days: [1, 2, 3, 4, 5], from: "10:30", to: "19:00" };
    expect(await workStartOn({ isWorkTime: async (d) => isWorkTime(d, late, TZ), nextWorkStart: async (d) => nextWorkStart(d, late, TZ) }, "2026-10-12", TZ)).toEqual(at("2026-10-12T05:30:00Z"));
  });

  it("последний день старта: дальше deadlinePlan уже не «успеваем» и не «впритык»", () => {
    const sell = { writeDays: 2, deliveryDays: 2, productionDays: 5 };
    const production = { standard: "5–7", premium: "3–4" };
    expect(lastStartDay("2026-10-20", sell, production)).toBe("2026-10-12");
    expect(deadlinePlan("2026-10-20", at("2026-10-12T06:00:00Z"), TZ, sell, production)?.kind).toBe("tight");
    expect(deadlinePlan("2026-10-20", at("2026-10-13T06:00:00Z"), TZ, sell, production)?.kind).not.toMatch(/ok|tight/);
    // Пишут дольше — последний день раньше; «пишут за 0 дней» — до самого дня, когда надо дописать.
    expect(lastStartDay("2026-10-20", { ...sell, writeDays: 4 }, production)).toBe("2026-10-10");
    expect(lastStartDay("2026-10-20", { ...sell, writeDays: 0 }, production)).toBe("2026-10-13");
    expect(lastStartDay("20.10.2026", sell, production)).toBeNull();
  });

  it("настройки приезжают выключенными: не больше 2 сообщений, не дальше 60 дней; границы — при чтении", () => {
    expect(defaultBotConfig.sell).toMatchObject({ remind: false, lastStart: false, remindMaxDays: 60, remindTouches: 2 });
    expect(parseBotConfig(JSON.stringify({ sell: { remind: true, lastStart: true, remindMaxDays: 30, remindTouches: 3 } })).sell).toMatchObject({ remind: true, lastStart: true, remindMaxDays: 30, remindTouches: 3 });
    expect(parseBotConfig(JSON.stringify({ sell: { remind: "yes", remindMaxDays: 999, remindTouches: 0 } })).sell).toMatchObject({ remind: false, remindMaxDays: 60, remindTouches: 2 });
  });

  it("старое состояние беседы — без договорённости и касаний", () => {
    expect(readSellerAi({ turns: 3 })).toMatchObject({ remind: null, touches: 0 });
  });
});

describe("Повторное сообщение: решение модели и ход", () => {
  const day = new Date("2026-10-01T06:00:00Z");
  const fields: DealField[] = [{ key: "recipient", label: "Для кого", type: "text", options: [] }];
  const config = (p: Partial<BotConfig["sell"]> = {}): BotConfig => ({ ...defaultBotConfig, sell: { ...defaultBotConfig.sell, on: true, hidePrices: false, speaksAs: "assistant", ...p } });
  const env = (c = config()): BotEnv => ({
    config: c,
    fields,
    dealValues: {},
    now: day,
    tz: TZ,
    workTime: true,
    nextWorkStart: day,
    catalog: { plans: [{ id: "hardcover", price: 30000 }], delivery: [], addons: [], productionDays: { standard: "5–7", premium: "3–4" } },
    site: { url: "https://mybook.kz", registrationOpen: false, themes: [], landings: [] },
    client: { known: false, locale: null },
    name: "Айгерим",
  });
  const decision = (p: Partial<SellerDecision> = {}): SellerDecision => ({
    summary: "",
    lang: "ru",
    stage: "objection",
    action: "reply",
    reply: "Конечно 😊 Тогда напишу вам в понедельник, 12 октября",
    handoff: "none",
    fields: {},
    eventDate: null,
    plan: "unknown",
    askedToOrder: false,
    agreed: false,
    agreedQuote: "",
    city: "",
    sendMaterials: false,
    remindAt: "2026-10-12",
    remindWhy: "после зарплаты",
    ...p,
  });
  const input: BotInput = { id: "m1", text: "Давайте после зарплаты", type: "text", at: day };
  const ctx = (p: Record<string, unknown> = {}) => ({ inputs: [input], clientText: input.text, priceInHistory: false, rules: { amounts: new Set<number>(), percents: new Set<number>(), urls: ["https://mybook.kz"], phones: [] }, ...p });
  const state = () => ({ ...newBotState(day, true), phase: "active" as const, engine: "ai" as const });
  const set = { kind: "promised" as const, at: "2026-10-12T04:00:00.000Z", why: "после зарплаты" };

  it("схема и разбор: remind_at и remind_why — только когда правило включено", () => {
    expect(sellerSchema(fields).properties).not.toHaveProperty("remind_at");
    expect(sellerSchema(fields, { remind: true }).required).toEqual(expect.arrayContaining(["remind_at", "remind_why"]));
    const d = parseSellerDecision({ action: "reply", reply: "Хорошо", remind_at: " 2026-10-12 ", remind_why: "после зарплаты" }, fields, day, TZ);
    expect(d).toMatchObject({ remindAt: "2026-10-12", remindWhy: "после зарплаты" });
    expect(parseSellerDecision({ action: "reply", reply: "Хорошо" }, fields, day, TZ)).toMatchObject({ remindAt: null, remindWhy: "" });
  });

  it("принятая кодом дата — в состояние беседы, в следе — когда и почему", () => {
    const turn = resolveSellerTurn(state(), decision(), env(), { ...ctx(), remind: { set } });
    expect(turn.reply).toContain("12 октября");
    expect(readSellerAi(turn.state.ai).remind).toEqual(set);
    expect(turn.notes).toContainEqual({ code: "remind_set", detail: "12 октября, 09:00 — после зарплаты" });
    // «Ок» в следующем ходе без remind_at договорённость не снимает; cancel — снимает.
    const ok = resolveSellerTurn(turn.state, decision({ action: "wait", reply: "", remindAt: null }), env(), { ...ctx({ inputs: [{ ...input, id: "m2", text: "Ок" }] }), remind: null });
    expect(readSellerAi(ok.state.ai).remind).toEqual(set);
    const cancel = resolveSellerTurn(ok.state, decision({ reply: "Хорошо, пишите, когда будет удобно 😊", remindAt: "cancel" }), env(), { ...ctx({ inputs: [{ ...input, id: "m3", text: "Не надо, я сама напишу" }] }), remind: { cancel: true } });
    expect(readSellerAi(cancel.state.ai).remind).toBeNull();
    expect(cancel.notes).toContainEqual({ code: "remind_cancelled" });
  });

  it("дата не подошла: модель переписывает ответ; со второго раза ответ уходит, дата отбрасывается", () => {
    const rejected = { rejected: "after_event" as const, problem: remindProblem("after_event", { maxDays: 60, eventDate: "2026-10-10" }) };
    const first = resolveSellerTurn(state(), decision(), env(), { ...ctx(), remind: rejected });
    expect(first.reply).toBeNull();
    expect(first.retry).toEqual([rejected.problem]);
    const second = resolveSellerTurn(state(), decision(), env(), { ...ctx({ second: true }), remind: rejected });
    expect(second.reply).toContain("12 октября");
    expect(readSellerAi(second.state.ai).remind).toBeNull();
    expect(second.notes).toContainEqual({ code: "remind_rejected", detail: "after_event" });
    expect(traceNoteText({ code: "remind_rejected", detail: "after_event" })).toBe("дату повторного сообщения отбросил: позже даты, к которой нужна книга");
  });

  it("инструкция: п.7б и формат — только когда правило включено; договорённость и «нельзя» — в блоке «Сейчас»", () => {
    const prompt = (c: BotConfig, remind: Parameters<typeof sellerSystemPrompt>[0]["remind"] = null) =>
      sellerSystemPrompt({ env: env(c), state: state(), questions: [], knowledge: "", brand: "MyBooks", known: [], deadline: null, takeoverMinutes: null, purpose: "reply", paid: false, followUps: 0, remind });
    const off = prompt(config());
    expect(off).not.toContain("remind_at");
    expect(off).not.toContain("7б.");
    const on = prompt(config({ remind: true, remindMaxDays: 45 }), { pending: null, blocked: null });
    expect(on).toContain("7б. Клиент сам называет, когда к нему вернуться");
    expect(on).toContain("Не дальше чем через 45 дней");
    expect(on).toContain("договорись о дне (п.7б)");
    expect(on).toContain("remind_at, remind_why — только по п.7б");
    expect(prompt(config({ remind: true }), { pending: set, blocked: null })).toContain("Договорённость (п.7б): клиент просил написать ему 12 октября («после зарплаты», слова клиента)");
    expect(prompt(config({ remind: true }), { pending: null, blocked: "no_marketing" })).toContain("не договаривайся (клиент просил не писать ему первым)");
  });

  it("сообщение в срок — свой режим: по договорённости или последний день старта", () => {
    const touch = (t: typeof set | { kind: "last_start"; at: string; why: string }) =>
      sellerSystemPrompt({ env: env(config({ remind: true })), state: state(), questions: [], knowledge: "", brand: "MyBooks", known: [], deadline: null, takeoverMinutes: null, purpose: "follow_up", paid: false, followUps: 3, touch: t });
    expect(touch(set)).toContain("Режим: сообщение по договорённости");
    expect(touch(set)).toContain("Келіскеніміздей жазып отырмын");
    const last = touch({ kind: "last_start", at: "2026-10-12T04:00:00.000Z", why: "2026-10-20" });
    expect(last).toContain("последний день, когда можно начать писать книгу и успеть к 20 октября");
    expect(last).not.toContain("Режим: последнее напоминание");
    expect(sellerUserPrompt("…", "follow_up", false, "promised")).toContain("клиент просил написать ему");
    expect(remindLabel({ kind: "last_start", at: "2026-10-12T04:00:00.000Z", why: "2026-10-20" }, TZ)).toBe("12 октября, 09:00 — последний день, чтобы успеть к 20 октября");
  });
});

// ─── в чате ─────────────────────────────────────────────────────────────────

const ans = (p: Record<string, unknown> = {}) => ({
  summary: "",
  language: "ru",
  stage: "discovery",
  action: "reply",
  reply: "Здравствуйте! Для кого будет книга?",
  handoff_reason: "none",
  fields: { recipient: "", occasion: "" },
  event_date: "",
  plan: "unknown",
  asked_to_order: false,
  agreed: false,
  agreed_quote: "",
  city: "",
  send_materials: false,
  remind_at: "",
  remind_why: "",
  ...p,
});

type Req = Parameters<BotSellerModel["complete"]>[0];
function fakeModel(script: Record<string, unknown>[]) {
  const calls: Req[] = [];
  const model: BotSellerModel = {
    configured: async () => true,
    complete: async (req) => {
      calls.push(req);
      const next = script.shift();
      if (next === undefined) throw new Error("модель: сценарий кончился");
      return { text: JSON.stringify(next), usage: { input: 100, output: 10 } };
    },
  };
  return { model, calls };
}

const aiConfig = (p: Partial<BotConfig["sell"]> = {}): BotConfig => ({ ...BOT_CONFIG, sell: { ...defaultBotConfig.sell, on: true, engine: "ai", takeover: true, hidePrices: false, speaksAs: "assistant", ...p } });
const INTRO = /^(?:Здравствуйте! 😊 Меня зовут Айгерим|Это Айгерим)/;
const said = (t: { sent: string[] }) => t.sent.filter((s) => !INTRO.test(s));
const internal = (t: ReturnType<typeof setup>) => t.msgs.filter((m) => m.internal).map((m) => m.text).join("\n");
const traces = (t: ReturnType<typeof setup>) => t.events.filter((e) => e.kind === "turn").map((e) => readBotTrace(e.meta)!);
/** Время идёт до момента (по одному проходу планировщика на шаг). */
const until = async (t: ReturnType<typeof setup>, iso: string) => t.advance(new Date(iso).getTime() - t.deps.clock.now().getTime());

describe("Бот пишет в названное клиентом время (в чате)", () => {
  const SALARY = "Хочу книгу маме, но сейчас денег нет — напишите после зарплаты, 10-го";

  it("суббота — нерабочий день: модель переносит на понедельник; лестницы напоминаний нет; в срок — «как и договаривались», дальше итог", async () => {
    const { model, calls } = fakeModel([
      ans({ stage: "objection", reply: "Конечно 😊 Тогда напишу вам 10 октября", remind_at: "2026-10-10", remind_why: "после зарплаты" }),
      ans({ stage: "objection", reply: "Конечно 😊 10-го суббота — напишу вам в понедельник, 12 октября, хорошо?", remind_at: "2026-10-12", remind_why: "после зарплаты" }),
      ans({ stage: "offer", reply: "Добрый день! 😊 Как и договаривались, пишу вам. Начнём книгу для мамы?" }),
    ]);
    const t = setup({ bot: "always", config: aiConfig({ remind: true, followUpHours: 3 }), seller: model, hours: WEEKDAYS });
    await t.service.ingest(inbound({ text: SALARY }));
    await t.advance(8_000);
    // Схема с remind_at; суббота отклонена кодом — модель переписала ответ.
    expect(calls[0].schema).toHaveProperty("properties.remind_at");
    expect(calls[1].system).toContain("в этот день или час мы не работаем");
    expect(said(t)).toEqual(["Конечно 😊 10-го суббота — напишу вам в понедельник, 12 октября, хорошо?"]);
    expect(readSellerAi(t.conv().botState!.ai).remind).toEqual({ kind: "promised", at: "2026-10-12T04:00:00.000Z", why: "после зарплаты" });
    expect(internal(t)).toContain("Клиент просил написать ему 12 октября, 09:00 — после зарплаты");
    expect(t.notes.join("\n")).toContain("Клиент просил написать ему 12 октября");
    expect(t.notified.map((n) => n.title)).toContain("Бот напишет по договорённости: Айгерим");
    // Тёплый клиент без договорённости получил бы «Ознакомились?» через 20 минут — здесь бот молчит до понедельника.
    await t.advance(21 * 60_000);
    await t.advance(4 * 3_600_000);
    await t.advance(24 * 3_600_000);
    expect(said(t)).toHaveLength(1);
    expect(t.conv().botState).toMatchObject({ phase: "active" });
    await until(t, "2026-10-12T04:00:30Z");
    expect(said(t).at(-1)).toBe("Добрый день! 😊 Как и договаривались, пишу вам. Начнём книгу для мамы?");
    expect(calls[2].system).toContain("Режим: сообщение по договорённости");
    expect(calls[2].system).toContain("«после зарплаты», слова клиента");
    expect(readSellerAi(t.conv().botState!.ai)).toMatchObject({ remind: null, touches: 1, followUps: 3 });
    expect(t.events).toContainEqual(expect.objectContaining({ kind: "follow_up", reason: "promised" }));
    expect(traces(t).at(-1)?.notes).toContainEqual({ code: "remind_touch", detail: "12 октября, 09:00 — после зарплаты" });
    // Клиент молчит и после этого — через 12 часов итог менеджеру, больше бот не пишет.
    await t.advance(12 * 3_600_000 + 60_000);
    expect(t.conv().botState).toMatchObject({ phase: "done", outcome: "offered" });
    expect(said(t)).toHaveLength(2);
  });

  it("выключено в настройках — схема без remind_at, дата модели не принимается, лестница как раньше", async () => {
    const { model, calls } = fakeModel([
      ans({ stage: "objection", reply: "Конечно 😊 Напишу вам 12 октября", remind_at: "2026-10-12", remind_why: "после зарплаты" }),
      ans({ stage: "objection", reply: "Ознакомились? 😊" }),
    ]);
    const t = setup({ bot: "always", config: aiConfig({ followUpHours: 3 }), seller: model });
    await t.service.ingest(inbound({ text: SALARY }));
    await t.advance(8_000);
    expect(calls[0].schema).not.toHaveProperty("properties.remind_at");
    expect(calls[0].system).not.toContain("7б.");
    expect(readSellerAi(t.conv().botState!.ai).remind).toBeNull();
    await t.advance(21 * 60_000);
    expect(said(t).at(-1)).toBe("Ознакомились? 😊");
  });

  it("клиент в стоп-листе «Не писать первым»: договариваться нельзя — ответ без обещания написать", async () => {
    const { model, calls } = fakeModel([
      ans({ stage: "objection", reply: "Конечно 😊 Напишу вам 12 октября", remind_at: "2026-10-12", remind_why: "после зарплаты" }),
      ans({ stage: "objection", reply: "Конечно 😊 Пишите, когда будет удобно — я на связи" }),
    ]);
    const t = setup({ bot: "always", config: aiConfig({ remind: true }), seller: model, noMarketing: ["77011234567"] });
    await t.service.ingest(inbound({ text: SALARY }));
    await t.advance(8_000);
    expect(calls[0].system).toContain("не договаривайся (клиент просил не писать ему первым)");
    expect(calls[1].system).toContain("сам писать этому клиенту позже нельзя");
    expect(said(t)).toEqual(["Конечно 😊 Пишите, когда будет удобно — я на связи"]);
    expect(readSellerAi(t.conv().botState!.ai).remind).toBeNull();
  });

  it("дата позже события: модель дважды настаивает — ответ уходит, дата отброшена, в следе почему", async () => {
    const first = ans({ stage: "objection", event_date: "2026-10-20", reply: "Хорошо 😊 Напишу 25 октября", remind_at: "2026-10-25", remind_why: "после отпуска" });
    const { model } = fakeModel([first, first, first]);
    const t = setup({ bot: "always", config: aiConfig({ remind: true }), seller: model });
    await t.service.ingest(inbound({ text: "Книга нужна к 20 октября, но напишите после отпуска, 25-го" }));
    await t.advance(8_000);
    expect(said(t)).toEqual(["Хорошо 😊 Напишу 25 октября"]);
    expect(readSellerAi(t.conv().botState!.ai).remind).toBeNull();
    const trace = traces(t).at(-1)!;
    expect(trace.notes).toContainEqual({ code: "remind_rejected", detail: "after_event" });
    expect(trace.notes.some((n) => n.code === "rewrite")).toBe(true);
  });

  it("лимит за беседу: после одного сообщения при лимите 1 вторую дату модель уже не получает", async () => {
    const { model, calls } = fakeModel([
      ans({ stage: "objection", reply: "Конечно 😊 Напишу вам 5 октября", remind_at: "2026-10-05", remind_why: "после зарплаты" }),
      ans({ stage: "offer", reply: "Добрый день! 😊 Как и договаривались, пишу вам" }),
      ans({ stage: "objection", reply: "Хорошо, напишу 9-го", remind_at: "2026-10-09", remind_why: "ещё неделю" }),
      ans({ stage: "objection", reply: "Хорошо 😊 Пишите, когда будет удобно" }),
    ]);
    const t = setup({ bot: "always", config: aiConfig({ remind: true, remindTouches: 1 }), seller: model });
    await t.service.ingest(inbound({ text: SALARY }));
    await t.advance(8_000);
    await t.advance(31 * 60_000);
    await until(t, "2026-10-05T04:00:30Z");
    expect(said(t)).toHaveLength(2);
    await t.service.ingest(inbound({ text: "Ой, ещё неделю, напишите 9-го", at: t.deps.clock.now() }));
    await t.advance(8_000);
    expect(calls[2].system).toContain("не договаривайся (повторно по договорённости уже писали)");
    expect(calls[3].system).toContain("сам писать этому клиенту позже нельзя");
    expect(said(t).at(-1)).toBe("Хорошо 😊 Пишите, когда будет удобно");
    expect(readSellerAi(t.conv().botState!.ai)).toMatchObject({ remind: null, touches: 1 });
  });

  it("к сроку клиент попросил не писать — сообщения нет, в журнале почему, дальше итог менеджеру", async () => {
    const { model } = fakeModel([ans({ stage: "objection", reply: "Конечно 😊 Напишу вам 12 октября", remind_at: "2026-10-12", remind_why: "после зарплаты" })]);
    const t = setup({ bot: "always", config: aiConfig({ remind: true }), seller: model });
    await t.service.ingest(inbound({ text: SALARY }));
    await t.advance(8_000);
    t.blocklist.set("77011234567", { reason: "no_marketing", note: null, by: "m1" });
    await t.advance(31 * 60_000);
    await until(t, "2026-10-12T04:00:30Z");
    expect(said(t)).toHaveLength(1);
    expect(t.events).toContainEqual(expect.objectContaining({ kind: "blocked", reason: "remind: no_marketing" }));
    await t.advance(60_000);
    expect(t.conv().botState).toMatchObject({ phase: "done" });
    expect(said(t)).toHaveLength(1);
  });

  it("менеджер ответил раньше — бот замолкает, в назначенный день не пишет", async () => {
    const { model } = fakeModel([ans({ stage: "objection", reply: "Конечно 😊 Напишу вам 12 октября", remind_at: "2026-10-12", remind_why: "после зарплаты" })]);
    const t = setup({ bot: "always", config: aiConfig({ remind: true }), seller: model });
    await t.service.ingest(inbound({ text: SALARY }));
    await t.advance(8_000);
    await t.service.send(t.conv().id, "Здравствуйте! Это Марат, давайте я сам вам помогу", "manager-1");
    await until(t, "2026-10-12T04:00:30Z");
    expect(said({ sent: t.msgs.filter((m) => m.source === "bot" && !m.internal).map((m) => m.text) })).toEqual(["Конечно 😊 Напишу вам 12 октября"]);
    expect(t.conv().botState).toMatchObject({ phase: "done", outcome: "stopped_by_manager" });
  });
});

describe("Бот пишет в последний день, чтобы успеть к дате (в чате)", () => {
  it("тёплый клиент с датой замолчал — вместо итога сообщение в последний день старта; потом итог", async () => {
    const offer = ans({ stage: "offer", event_date: "2026-10-20", reply: "Успеваем 🙌 Оформляем?", asked_to_order: true });
    const { model, calls } = fakeModel([offer, offer, ans({ stage: "offer", reply: "Добрый день! 😊 Чтобы книга успела к 20 октября, начать писать лучше сегодня — оформим?" })]);
    const t = setup({ bot: "always", config: aiConfig({ lastStart: true, followUpHours: 0 }), seller: model });
    await t.service.ingest(inbound({ text: "Хочу книгу маме к 20 октября" }));
    await t.advance(8_000);
    expect(said(t)).toEqual(["Успеваем 🙌 Оформляем?"]);
    await t.advance(31 * 60_000);
    await t.advance(12 * 3_600_000);
    // Итога ещё нет: бот напишет 12 октября (20-е − доставка 2 − изготовление 5 − «впритык» 1 день).
    expect(t.conv().botState).toMatchObject({ phase: "active", ai: expect.objectContaining({ remind: { kind: "last_start", at: "2026-10-12T04:00:00.000Z", why: "2026-10-20" } }) });
    expect(internal(t)).toContain("Клиент молчит. Бот напишет ему один раз: 12 октября, 09:00 — последний день, чтобы успеть к 20 октября");
    expect(t.notified.some((n) => n.title.startsWith("Бот напишет в последний день"))).toBe(true);
    await until(t, "2026-10-12T04:00:30Z");
    expect(said(t).at(-1)).toBe("Добрый день! 😊 Чтобы книга успела к 20 октября, начать писать лучше сегодня — оформим?");
    expect(calls[2].system).toContain("Режим: последний день, чтобы успеть к дате");
    expect(calls[2].system).toContain("впритык");
    expect(traces(t).at(-1)?.notes).toContainEqual({ code: "last_start", detail: "12 октября, 09:00 — последний день, чтобы успеть к 20 октября" });
    await t.advance(12 * 3_600_000 + 60_000);
    expect(t.conv().botState).toMatchObject({ phase: "done", outcome: "offered", ai: expect.objectContaining({ touches: 1 }) });
    expect(said(t)).toHaveLength(2);
  });

  it("выключено, без даты или уже платил — итог менеджеру как раньше", async () => {
    for (const [config, text, dealPaid] of [
      [aiConfig({ followUpHours: 0 }), "Хочу книгу маме к 20 октября", 0],
      [aiConfig({ lastStart: true, followUpHours: 0 }), "Хочу книгу маме", 0],
      [aiConfig({ lastStart: true, followUpHours: 0 }), "Хочу книгу маме к 20 октября", 10000],
    ] as const) {
      const offer = ans({ stage: "offer", event_date: text.includes("20") ? "2026-10-20" : "", reply: "Успеваем 🙌 Оформляем?", asked_to_order: true });
      const { model } = fakeModel([offer, offer]);
      const t = setup({ bot: "always", config, seller: model, dealPaid });
      await t.service.ingest(inbound({ text }));
      await t.advance(8_000);
      await t.advance(31 * 60_000);
      await t.advance(12 * 3_600_000);
      expect(t.conv().botState).toMatchObject({ phase: "done" });
      expect(readSellerAi(t.conv().botState!.ai).remind).toBeNull();
    }
  });
});
