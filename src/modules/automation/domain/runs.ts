import type { RuleAction, TriggerContext } from "./rules";

/**
 * Журнал срабатываний правила (automation-13, automation-d1): строка crm_automation_runs — и отметка «для этого объекта
 * правило уже сработало», и запись о том, что вышло. running — действия выполняются (или процесс упал посреди них);
 * done — выполнены; error — действие бросило исключение (на странице правила — «Повторить»); deferred — сообщение
 * клиенту ждёт окна или лимита сообщений от правил и уйдёт в 30-минутном проходе.
 */
export type RunStatus = "running" | "done" | "error" | "deferred";
export const RUN_STATUSES: readonly RunStatus[] = ["running", "done", "error", "deferred"];

/** Что сделало одно действие: ok — сделало; skipped — не понадобилось или не прошло проверку; deferred; error. */
export type StepResult = "ok" | "skipped" | "deferred" | "error";

export interface RunStep {
  /** Номер действия в правиле (с нуля). */
  i: number;
  action: RuleAction["type"];
  result: StepResult;
  /** Подробность для сотрудника: «такая задача уже открыта», «нет переписки». */
  note?: string;
}

export interface RunDetails {
  /** Контекст срабатывания — для «Повторить» и отложенной отправки (те же объекты, что в первый раз). */
  ctx: TriggerContext;
  steps: RunStep[];
  /** Текст исключения и номер действия, на котором оно случилось: повтор начинается с него. */
  error?: string;
  failedAt?: number;
  /** Номера действий-сообщений, отложенных до окна. */
  deferred?: number[];
}

/** Журнал на странице правила — последние срабатывания. */
export const RUNS_LIST_LIMIT = 200;
/** Подробности срабатываний хранятся 90 дней; сами отметки остаются — по ним правило не срабатывает дважды. */
export const RUN_DETAILS_KEEP_DAYS = 90;
/** Отложенное сообщение ждёт окна не дольше суток: потом оно уже не к месту — ошибка с заметкой. */
export const DEFER_MAX_MS = 24 * 3_600_000;
/** Сколько отложенных срабатываний досылается за проход. */
export const DEFERRED_BATCH = 50;

/** Итог срабатывания по шагам. */
export function runStatus(steps: readonly RunStep[], failed: boolean): RunStatus {
  if (failed) return "error";
  return steps.some((s) => s.result === "deferred") ? "deferred" : "done";
}

export function readRunDetails(raw: unknown): RunDetails | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Partial<RunDetails>;
  if (!r.ctx || typeof r.ctx.subject !== "string" || !Array.isArray(r.steps)) return null;
  return { ctx: r.ctx, steps: r.steps, error: r.error, failedAt: r.failedAt, deferred: r.deferred };
}

/** Подписи для журнала на странице правила. */
export const runStatusLabels: Record<RunStatus, string> = {
  running: "выполняется или прервалось",
  done: "выполнено",
  error: "ошибка",
  deferred: "сообщение ждёт окна",
};

export const stepResultLabels: Record<StepResult, string> = { ok: "сделано", skipped: "пропущено", deferred: "отложено", error: "ошибка" };
