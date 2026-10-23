import { zonedParts } from "@/shared/domain/time";

/**
 * Личные настройки push сотрудника (tasks-19, tasks-22): тихие часы — ночью push не будит (колокольчик и открытые вкладки
 * получают всё), напоминание о задаче приходит всегда; push о сообщениях клиентов — можно выключить тому, кто и так видит
 * WhatsApp на телефоне магазина.
 */
export interface NotifyPrefs {
  quiet: boolean;
  /** «22:00» — «08:00» по поясу магазина; конец раньше начала — через полночь. */
  quietFrom: string;
  quietTo: string;
  pushMessages: boolean;
}

/** По умолчанию (решение владельца): тихие часы 22:00–08:00, push о сообщениях — как раньше, включены. */
export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = { quiet: true, quietFrom: "22:00", quietTo: "08:00", pushMessages: true };

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function readNotifyPrefs(raw: unknown): NotifyPrefs {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Partial<NotifyPrefs>) : {};
  return {
    quiet: typeof r.quiet === "boolean" ? r.quiet : DEFAULT_NOTIFY_PREFS.quiet,
    quietFrom: typeof r.quietFrom === "string" && timeRe.test(r.quietFrom) ? r.quietFrom : DEFAULT_NOTIFY_PREFS.quietFrom,
    quietTo: typeof r.quietTo === "string" && timeRe.test(r.quietTo) ? r.quietTo : DEFAULT_NOTIFY_PREFS.quietTo,
    pushMessages: typeof r.pushMessages === "boolean" ? r.pushMessages : DEFAULT_NOTIFY_PREFS.pushMessages,
  };
}

export const isValidPrefTime = (t: string) => timeRe.test(t);

/** Сейчас тихие часы сотрудника. */
export function inQuietHours(p: NotifyPrefs, now: Date, tz?: string) {
  if (!p.quiet) return false;
  const { minutes } = zonedParts(now, tz);
  const from = toMin(p.quietFrom);
  const to = toMin(p.quietTo);
  if (from === to) return false;
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}

/** Будить ли сотрудника push: напоминание о задаче — всегда, сообщение клиента — если он не выключил, остальное — не в тихие часы. */
export function pushAllowed(p: NotifyPrefs, kind: string, now: Date, tz?: string) {
  if (kind === "reminder") return true;
  if (kind === "message" && !p.pushMessages) return false;
  return !inQuietHours(p, now, tz);
}
