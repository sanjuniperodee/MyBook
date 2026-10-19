import { workMinutesBetween, type WorkHours } from "@/shared/domain/schedule";
import { storeTimeZone } from "@/shared/domain/time";

/** Норматив ответа, если в настройках CRM он не задан или испорчен, — рабочих минут. */
export const DEFAULT_SLA_MINUTES = 15;

/** Норматив ответа из настроек CRM (crm.slaMinutes): целое число минут от 1, иначе DEFAULT_SLA_MINUTES. */
export function slaMinutes(raw: string | null | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : DEFAULT_SLA_MINUTES;
}

/**
 * Подпись рабочих минут ожидания: «12 мин», «1 ч 5 мин», а от длины смены — «2 раб. дн» (дни — смены графика: при
 * 09:00–21:00 это 12 часов, а не сутки). Без длины смены — только часы: «48 ч», а не «2 дн», которые читались бы как сутки.
 */
export function waitLabel(m: number, shiftMinutes?: number) {
  if (m < 60) return `${m} мин`;
  if (shiftMinutes && shiftMinutes >= 60 && m >= shiftMinutes) return `${Math.floor(m / shiftMinutes)} раб. дн`;
  return `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ""}`;
}

/** Длина смены по графику, минут: 09:00–21:00 — 720; смена через полночь (20:00–02:00) — 360; from = to — сутки. */
export function shiftMinutes(hours: Pick<WorkHours, "from" | "to">) {
  const min = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const len = (min(hours.to) - min(hours.from) + 1440) % 1440;
  return len || 1440;
}

/** Цвет метки ожидания: норматив вышел — красная, иначе — жёлтая. Одна на «Чаты» и «Мой день». */
export const waitTone = (overdue: boolean) => (overdue ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800");

/**
 * Сколько клиент ждёт ответа — в рабочих минутах по графику отдела продаж, как норматив считает правило «нет ответа»:
 * ночь и выходные не идут, ночное сообщение утром ждёт с начала смены. overdue — норматив (sla) вышел. Одно правило
 * для «Чатов» и «Моего дня» (tasks-d6): числа и цвета на двух экранах совпадают.
 */
export function responseWait(since: Date, now: Date, hours: WorkHours, sla: number, tz = storeTimeZone()) {
  const minutes = workMinutesBetween(since, now, hours, tz);
  return { minutes, overdue: minutes >= sla, label: waitLabel(minutes, shiftMinutes(hours)) };
}
