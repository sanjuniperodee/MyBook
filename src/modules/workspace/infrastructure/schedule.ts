import "server-only";
import type { WorkSchedule } from "@/shared/application";
import { isWorkTime, parseWorkHours, workMinutesBetween } from "@/shared/domain/schedule";
import { getSetting } from "./settings";

/** График из настроек CRM (getSetting сам кэширует значения на несколько секунд). */
const hours = async () => parseWorkHours(await getSetting("crm.workHours"));

/** Порт графика работы для других модулей (src/shared/application). */
export const workSchedule: WorkSchedule = {
  isWorkTime: async (at) => isWorkTime(at, await hours()),
  workMinutesBetween: async (from, to) => workMinutesBetween(from, to, await hours()),
};
