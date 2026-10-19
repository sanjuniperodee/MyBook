import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_SENDING, inRuleWindow, localDayStart, parseRuleSending, ruleSendBlock } from "@/modules/messaging/domain";
import { inbound, setup } from "./doubles/botHarness";

/**
 * Защита номера WhatsApp (automation-15): правила автоматизаций пишут клиентам первыми только в окне 09:00–21:00 по
 * Алматы и не больше лимита в сутки (по умолчанию 40). Автоответ на сообщение клиента — в любое время.
 */

const TZ = "Asia/Almaty";
/** Местное время Алматы (UTC+5) 1 октября 2026 (или другого дня). */
const almaty = (hhmm: string, day = "2026-10-01") => new Date(`${day}T${hhmm}:00+05:00`);

describe("окно и лимит (домен)", () => {
  it("настройки: окно JSON и лимит числом; мусор — 09:00–21:00 и 40; лимит не больше 300", () => {
    expect(parseRuleSending("", "")).toEqual(DEFAULT_RULE_SENDING);
    expect(DEFAULT_RULE_SENDING).toEqual({ from: "09:00", to: "21:00", dailyLimit: 40 });
    expect(parseRuleSending('{"from":"10:00","to":"20:00"}', "15")).toEqual({ from: "10:00", to: "20:00", dailyLimit: 15 });
    expect(parseRuleSending('{"from":"9","to":"20:00"}', "-3")).toEqual(DEFAULT_RULE_SENDING);
    expect(parseRuleSending("не json", "0").dailyLimit).toBe(0);
    expect(parseRuleSending(null, "5000").dailyLimit).toBe(300);
  });

  it("граница 21:00 и 09:00 по Алматы, а не по UTC и не по поясу сервера", () => {
    const p = DEFAULT_RULE_SENDING;
    expect(inRuleWindow(almaty("08:59"), p, TZ)).toBe(false);
    expect(inRuleWindow(almaty("09:00"), p, TZ)).toBe(true);
    expect(inRuleWindow(almaty("20:59"), p, TZ)).toBe(true);
    expect(inRuleWindow(almaty("21:00"), p, TZ)).toBe(false);
    // 21:00 по Алматы — это 16:00 UTC: по UTC окно было бы ещё открыто.
    expect(inRuleWindow(new Date("2026-10-01T16:00:00Z"), p, TZ)).toBe(false);
    expect(inRuleWindow(new Date("2026-10-01T15:59:00Z"), p, TZ)).toBe(true);
    // Окно через полночь и круглые сутки.
    expect(inRuleWindow(almaty("23:30"), { from: "20:00", to: "02:00" }, TZ)).toBe(true);
    expect(inRuleWindow(almaty("03:00"), { from: "20:00", to: "02:00" }, TZ)).toBe(false);
    expect(inRuleWindow(almaty("03:00"), { from: "00:00", to: "00:00" }, TZ)).toBe(true);
  });

  it("сутки лимита — местные: 01:30 по Алматы 2 октября — это ещё 1 октября по UTC", () => {
    expect(localDayStart(new Date("2026-10-01T20:30:00Z"), TZ)).toEqual(new Date("2026-10-01T19:00:00Z"));
    expect(ruleSendBlock(DEFAULT_RULE_SENDING, almaty("12:00"), 39, TZ)).toBeNull();
    expect(ruleSendBlock(DEFAULT_RULE_SENDING, almaty("12:00"), 40, TZ)).toBe("limit");
    expect(ruleSendBlock(DEFAULT_RULE_SENDING, almaty("22:00"), 0, TZ)).toBe("window");
  });
});

describe("сообщение правила (sendAutomated)", () => {
  it("20:59 — уходит, 21:00 — нет: заметка в сделку; 08:59 — нет, 09:00 — уходит", async () => {
    const t = setup();
    await t.service.ingest(inbound());
    const id = t.conv().id;
    const send = (hhmm: string) => (t.setNow(almaty(hhmm)), t.service.sendAutomated(id, "Напоминаем о книге", { rule: "Забросил книгу" }));
    expect(await send("20:59")).toMatchObject({ status: "sent" });
    expect(await send("21:00")).toBeNull();
    expect(t.notes.at(-1)).toBe("Правило «Забросил книгу» не отправило клиенту сообщение: вне окна 09:00–21:00 (Алматы). Если нужно — напишите клиенту сами. Окно и лимит — «Интеграции» → «Мессенджеры».");
    expect(await send("08:59")).toBeNull();
    expect(await send("09:00")).toMatchObject({ status: "sent" });
    expect(t.sent).toEqual(["Напоминаем о книге", "Напоминаем о книге"]);
    expect(await t.service.ruleSendBlock()).toBeNull();
    t.setNow(almaty("23:00"));
    expect(await t.service.ruleSendBlock()).toBe("window");
  });

  it("автоответ на сообщение клиента уходит и ночью", async () => {
    const t = setup();
    await t.service.ingest(inbound());
    t.setNow(almaty("23:40"));
    expect(await t.service.sendAutomated(t.conv().id, "Ответим утром", { rule: "Вне рабочего времени → автоответ", reply: true })).toMatchObject({ status: "sent" });
  });

  it("лимит в сутки: сверх — не уходит, руководителям одно уведомление; автоответ идёт и в счёт; назавтра — с нуля", async () => {
    const t = setup({ ruleSending: { from: "09:00", to: "21:00", dailyLimit: 2 } });
    await t.service.ingest(inbound());
    const id = t.conv().id;
    t.setNow(almaty("12:00"));
    // Заметки сотрудникам от CRM («клиент просил не писать») в счёт не идут — только сообщения клиенту.
    await t.service.addInternalNote(id, "Заметка CRM", null, "rule");
    expect(await t.service.sendAutomated(id, "Первое", { rule: "Годовщина" })).toMatchObject({ status: "sent" });
    expect(await t.service.sendAutomated(id, "Второе", { rule: "Годовщина" })).toMatchObject({ status: "sent" });
    expect(await t.service.sendAutomated(id, "Третье", { rule: "Годовщина" })).toBeNull();
    expect(await t.service.sendAutomated(id, "Четвёртое", { rule: "Годовщина" })).toBeNull();
    expect(t.notes.at(-1)).toContain("Правило «Годовщина» не отправило клиенту сообщение: лимит 2 сообщений от правил в сутки исчерпан.");
    expect(t.alerts).toEqual([{ title: "Сообщения от правил на сегодня закончились: 2 в сутки", body: expect.stringContaining("Лимит — «Интеграции» → «Мессенджеры»") }]);
    expect(await t.service.ruleSendBlock()).toBe("limit");
    expect(t.alerts).toHaveLength(1);
    expect(await t.service.sendAutomated(id, "Ответим утром", { rule: "Автоответ", reply: true })).toMatchObject({ status: "sent" });
    expect(await t.service.ruleSendingToday()).toEqual({ policy: { from: "09:00", to: "21:00", dailyLimit: 2 }, sent: 3 });
    t.setNow(almaty("10:00", "2026-10-02"));
    expect(await t.service.sendAutomated(id, "Пятое", { rule: "Годовщина" })).toMatchObject({ status: "sent" });
    expect(t.sent).toEqual(["Первое", "Второе", "Ответим утром", "Пятое"]);
  });

  it("лимит 0 — правила первыми не пишут, без тревоги руководителям", async () => {
    const t = setup({ ruleSending: { from: "09:00", to: "21:00", dailyLimit: 0 } });
    await t.service.ingest(inbound());
    expect(await t.service.sendAutomated(t.conv().id, "Скидка", { rule: "Акция" })).toBeNull();
    expect(t.notes.at(-1)).toContain("сообщения от правил выключены (лимит 0)");
    expect(t.alerts).toEqual([]);
  });
});
