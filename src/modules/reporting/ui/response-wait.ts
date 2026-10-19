import { workMinutesBetween, type WorkHours } from "@/shared/domain/schedule";
import { storeTimeZone } from "@/shared/domain/time";

/** Норматив ответа, если в настройках CRM он не задан или испорчен, — рабочих минут. */
export const DEFAULT_SLA_MINUTES = 15;

/** Норматив ответа из настроек CRM (crm.slaMinutes): целое число минут от 1, иначе DEFAULT_SLA_MINUTES. */
export function slaMinutes(raw: string | null | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : DEFAULT_SLA_MINUTES;
}

/** «12 мин», «1 ч 5 мин», «2 дн». */
export const waitLabel = (m: number) => (m < 60 ? `${m} мин` : m < 1440 ? `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ""}` : `${Math.floor(m / 1440)} дн`);

/** Цвет метки ожидания: норматив вышел — красная, иначе — жёлтая. Одна на «Чаты» и «Мой день». */
export const waitTone = (overdue: boolean) => (overdue ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800");

/**
 * Сколько клиент ждёт ответа — в рабочих минутах по графику отдела продаж, как норматив считает правило «нет ответа»:
 * ночь и выходные не идут, ночное сообщение утром ждёт с начала смены. overdue — норматив (sla) вышел. Одно правило
 * для «Чатов» и «Моего дня» (tasks-d6): числа и цвета на двух экранах совпадают.
 */
export function responseWait(since: Date, now: Date, hours: WorkHours, sla: number, tz = storeTimeZone()) {
  const minutes = workMinutesBetween(since, now, hours, tz);
  return { minutes, overdue: minutes >= sla, label: waitLabel(minutes) };
}
