import { describe, expect, it } from "vitest";
import { AUTO_GREETING_QUIET_MS, AUTO_GREETING_WINDOW_MS, isAutoGreetingEcho } from "@/modules/messaging/domain";

const T = new Date("2026-10-24T13:13:45Z").getTime();
const msg = (direction: "in" | "out", offsetMs: number, over: Partial<{ source: "bot" | "rule" | "system" | null; internal: boolean }> = {}) => ({ direction, source: null, internal: false, createdAt: new Date(T + offsetMs), ...over });
const echoAt = (offsetMs: number) => new Date(T + offsetMs);

describe("isAutoGreetingEcho: автоприветствие WhatsApp Business", () => {
  it("эхо через секунды после первого сообщения клиента — приветствие", () => {
    expect(isAutoGreetingEcho(echoAt(6_000), [msg("in", 0)])).toBe(true);
  });

  it("позже окна — ответ человека", () => {
    expect(isAutoGreetingEcho(echoAt(AUTO_GREETING_WINDOW_MS), [msg("in", 0)])).toBe(true);
    expect(isAutoGreetingEcho(echoAt(AUTO_GREETING_WINDOW_MS + 1), [msg("in", 0)])).toBe(false);
  });

  it("нет сообщения клиента или последним было исходящее человека — не приветствие", () => {
    expect(isAutoGreetingEcho(echoAt(6_000), [])).toBe(false);
    expect(isAutoGreetingEcho(echoAt(6_000), [msg("in", -60_000), msg("out", 0)])).toBe(false);
  });

  it("магазин писал клиенту в последние 14 дней — не приветствие; раньше — приветствие (WhatsApp шлёт его и после паузы)", () => {
    const recent = msg("out", -AUTO_GREETING_QUIET_MS + 60_000);
    const old = msg("out", -AUTO_GREETING_QUIET_MS - 60_000);
    expect(isAutoGreetingEcho(echoAt(6_000), [recent, msg("in", 0)])).toBe(false);
    expect(isAutoGreetingEcho(echoAt(6_000), [old, msg("in", 0)])).toBe(true);
  });

  it("бот, правила и заметки не считаются перепиской человека", () => {
    expect(isAutoGreetingEcho(echoAt(6_000), [msg("out", -60_000, { source: "bot" }), msg("out", -50_000, { source: "rule" }), msg("out", -40_000, { internal: true }), msg("in", 0)])).toBe(true);
    // Бот успел ответить раньше приветствия: клиент написал 5 с назад, бот — 1 с назад.
    expect(isAutoGreetingEcho(echoAt(6_000), [msg("in", 0), msg("out", 5_000, { source: "bot" })])).toBe(true);
  });

  it("прошлое автоприветствие (source system) не мешает распознать новое", () => {
    expect(isAutoGreetingEcho(echoAt(6_000), [msg("in", -20 * 86_400_000), msg("out", -20 * 86_400_000 + 6_000, { source: "system" }), msg("in", 0)])).toBe(true);
  });
});
