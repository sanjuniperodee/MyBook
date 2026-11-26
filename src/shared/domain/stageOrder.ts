import { zonedDay } from "./time";

/**
 * «Порядок в воронке»: заявка без оплаты сама идёт по этапам вслед за перепиской — менеджеру не нужно двигать её руками.
 * Здесь настройка и решение по одной заявке (без базы и времени — для сервера, страницы настроек и тестов).
 *
 * Смотрим на последнее сообщение КЛИЕНТА, а не на любую активность: рассылка «акция сегодня» молчащего клиента не оживляет.
 */
export interface StageOrderConfig {
  on: boolean;
  /** Этап «в работе»: сюда — как только мы ответили на новую заявку и когда замолчавший клиент написал снова. */
  workStageId: string;
  /** Этап «не отвечает»: клиент молчит silentDays дней. */
  silentStageId: string;
  silentDays: number;
  /** Через сколько дней молчания заявка закрывается отказом с причиной lostReason. */
  lostDays: number;
  lostReason: string;
  /** Этап для сделки, по которой пришла оплата (предоплата при заведении клиента, платёж, счёт); пусто — не двигать. */
  paidStageId: string;
}

export const STAGE_ORDER_DEFAULTS = { silentDays: 3, lostDays: 14, lostReason: "Не отвечает" } as const;
export const STAGE_ORDER_LIMITS = { silentDays: 30, lostDays: 90 } as const;

const whole = (v: unknown, fallback: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, max) : fallback;
};

/** Настройка из JSON: мусор — выключено; дни — целые в пределах; отказ не раньше, чем «не отвечает». */
export function parseStageOrder(raw: string | null | undefined): StageOrderConfig {
  let v: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) v = parsed as Record<string, unknown>;
  } catch {
    v = {};
  }
  const silentDays = whole(v.silentDays, STAGE_ORDER_DEFAULTS.silentDays, STAGE_ORDER_LIMITS.silentDays);
  const lostDays = Math.max(whole(v.lostDays, STAGE_ORDER_DEFAULTS.lostDays, STAGE_ORDER_LIMITS.lostDays), silentDays + 1);
  const workStageId = typeof v.workStageId === "string" ? v.workStageId : "";
  const silentStageId = typeof v.silentStageId === "string" ? v.silentStageId : "";
  return {
    on: v.on === true && !!workStageId && !!silentStageId && workStageId !== silentStageId,
    workStageId,
    silentStageId,
    silentDays,
    lostDays,
    lostReason: typeof v.lostReason === "string" && v.lostReason.trim() ? v.lostReason.trim().slice(0, 80) : STAGE_ORDER_DEFAULTS.lostReason,
    paidStageId: typeof v.paidStageId === "string" ? v.paidStageId : "",
  };
}

/** Что известно о заявке: где стоит и когда кто писал. */
export interface StageOrderDeal {
  stageId: string;
  /** Заявка на первом этапе воронки («Новая заявка»). */
  onEntryStage: boolean;
  createdAt: Date;
  stageChangedAt: Date;
  /** Последнее сообщение клиента и наш последний ответ (человек или бот; заметки и сообщения правил не в счёт). */
  lastIn: Date | null;
  lastOut: Date | null;
  /** У сделки есть открытая задача, которую поставил сотрудник, — у менеджера свой план, заявку не трогаем (кроме «взяли в работу»). Задачи правил не в счёт. */
  hasOpenTask: boolean;
  /** «Дата события» сделки (ГГГГ-ММ-ДД), если есть: пока она впереди, молчащую заявку отказом не закрываем. */
  eventDate?: string | null;
}

export type StageOrderMove = { to: "work" | "silent" | "lost"; why: string };

const DAY = 86_400_000;
const days = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "день" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "дня" : "дней"}`;

/**
 * Куда перевести заявку сейчас (null — оставить):
 * - на этапе «не отвечает» клиент написал после перевода туда → «в работе»;
 * - на первом этапе мы уже ответили клиенту → «в работе»;
 * - на первом этапе или «в работе» клиент молчит silentDays дней после нашего ответа → «не отвечает»;
 * - на этапе «не отвечает» клиент молчит lostDays дней → отказ, но не раньше «Даты события»: клиент, который назвал
 *   дату подарка, часто возвращается ближе к ней — до неё заявка ждёт на «не отвечает» (аналитика 09.11).
 * Заявке, на которую мы ещё не ответили, этап не меняем: она должна оставаться на виду.
 */
export function stageOrderMove(d: StageOrderDeal, cfg: StageOrderConfig, now: Date): StageOrderMove | null {
  if (!cfg.on) return null;
  const lastClient = d.lastIn ?? d.createdAt;
  const silentFor = Math.floor((now.getTime() - lastClient.getTime()) / DAY);
  const answered = !!d.lastOut && (!d.lastIn || d.lastOut >= d.lastIn);
  if (d.stageId === cfg.silentStageId) {
    if (d.lastIn && d.lastIn > d.stageChangedAt) return { to: "work", why: "клиент снова написал" };
    const eventAhead = !!d.eventDate && /^\d{4}-\d{2}-\d{2}$/.test(d.eventDate) && d.eventDate >= zonedDay(now);
    if (!d.hasOpenTask && !eventAhead && silentFor >= cfg.lostDays) return { to: "lost", why: `клиент не отвечает ${days(silentFor)}` };
    return null;
  }
  if (!d.onEntryStage && d.stageId !== cfg.workStageId) return null;
  if (answered && !d.hasOpenTask && silentFor >= cfg.silentDays) return { to: "silent", why: `клиент не отвечает ${days(silentFor)}` };
  if (d.onEntryStage && d.lastOut && d.stageId !== cfg.workStageId) return { to: "work", why: "менеджер ответил клиенту" };
  return null;
}
