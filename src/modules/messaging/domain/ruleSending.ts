/**
 * Окно и суточный лимит сообщений клиентам от правил автоматизаций (automation-15): номер WhatsApp у магазина один,
 * на нём держатся все продажи, а ночные и массовые автоматические сообщения — прямой путь к жалобам и бану. Время —
 * по поясу магазина (Алматы). Ответ на только что пришедшее сообщение клиента (автоответ) окно и лимит не держат.
 */
import { isValidTime, isWorkTime } from "@/shared/domain/schedule";
import { fromZonedTime, storeTimeZone, zonedDay } from "@/shared/domain/time";

export interface RuleSendingPolicy {
  /** С какого и до какого времени правила пишут клиентам: «09:00»–«21:00»; конец раньше начала — окно через полночь. */
  from: string;
  to: string;
  /** Сколько сообщений от правил уходит клиентам за местные сутки; 0 — правила первыми не пишут вовсе. */
  dailyLimit: number;
}

export const DEFAULT_RULE_SENDING: RuleSendingPolicy = { from: "09:00", to: "21:00", dailyLimit: 40 };
/** Больше — уже рассылка, а массовые рассылки через неофициальный шлюз не делаем. */
export const RULE_DAILY_LIMIT_MAX = 300;

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

/** Настройки «Интеграции» → «Мессенджеры»: окно — JSON { from, to }, лимит — число; мусор — значения по умолчанию. */
export function parseRuleSending(windowRaw: string | null | undefined, limitRaw: string | null | undefined): RuleSendingPolicy {
  let from = DEFAULT_RULE_SENDING.from;
  let to = DEFAULT_RULE_SENDING.to;
  try {
    const v = JSON.parse(windowRaw ?? "") as { from?: unknown; to?: unknown };
    if (typeof v.from === "string" && isValidTime(v.from) && typeof v.to === "string" && isValidTime(v.to)) {
      from = v.from;
      to = v.to;
    }
  } catch {}
  const n = limitRaw == null || limitRaw.trim() === "" ? NaN : Number(limitRaw);
  const dailyLimit = Number.isInteger(n) && n >= 0 ? Math.min(n, RULE_DAILY_LIMIT_MAX) : DEFAULT_RULE_SENDING.dailyLimit;
  return { from, to, dailyLimit };
}

/** Сейчас окно для сообщений правил (одинаковое начало и конец — круглые сутки). */
export const inRuleWindow = (at: Date, p: Pick<RuleSendingPolicy, "from" | "to">, tz = storeTimeZone()) => isWorkTime(at, { days: ALL_DAYS, from: p.from, to: p.to }, tz);

/** Начало местных суток момента at — от него считается суточный лимит. */
export const localDayStart = (at: Date, tz = storeTimeZone()) => fromZonedTime(`${zonedDay(at, tz)}T00:00:00`, tz);

/** Почему сообщение правила сейчас не уходит: вне окна или лимит за сутки исчерпан; null — можно. */
export type RuleSendBlock = "window" | "limit";

export function ruleSendBlock(p: RuleSendingPolicy, at: Date, sentToday: number, tz = storeTimeZone()): RuleSendBlock | null {
  if (!inRuleWindow(at, p, tz)) return "window";
  if (sentToday >= p.dailyLimit) return "limit";
  return null;
}

/** Для заметки и лога: «вне окна 09:00–21:00» / «лимит 40 сообщений в сутки исчерпан». */
export const ruleSendBlockText = (block: RuleSendBlock, p: RuleSendingPolicy) =>
  block === "window" ? `вне окна ${p.from}–${p.to} (Алматы)` : p.dailyLimit === 0 ? "сообщения от правил выключены (лимит 0)" : `лимит ${p.dailyLimit} сообщений от правил в сутки исчерпан`;
