import type { OpsFacts, PulseRow } from "../domain/health";

/** Итог одного прохода задания для записи пульса. */
export interface PulseRecord {
  job: string;
  everySec: number | null;
  startedAt: Date;
  finishedAt: Date;
  outcome: "ok" | "error" | "off";
  error: string | null;
  note: string | null;
}

/** Пульсы заданий (таблица job_pulses). */
export interface PulseStore {
  /** Задание началось (долгие проходы: видно «идёт с …» и зависание). */
  start(job: string, everySec: number | null, at: Date): Promise<void>;
  /** Итоги проходов — одним запросом. */
  finish(records: PulseRecord[]): Promise<void>;
  all(): Promise<PulseRow[]>;
}

/** Агрегаты очередей по индексам: каждая выборка — по частичному индексу или окну времени, без обхода таблиц. */
export interface OpsFactsReader {
  /** pulses — уже прочитанные пульсы; voices — считать ли голосовые (расшифровка включена). */
  facts(now: Date, opts: { voices: boolean }): Promise<Omit<OpsFacts, "pulses" | "cashier" | "mail"> & { mail: Omit<OpsFacts["mail"], "autoOn"> }>;
}

/** Состояние оповещений о потоках (таблица ops_alerts). */
export interface OpsAlertStore {
  all(): Promise<Map<string, { downSince: Date | null; notifiedAt: Date | null }>>;
  save(stream: string, state: { downSince: Date | null; notifiedAt: Date | null }): Promise<void>;
}

/** Настройки, от которых зависит сводка: выключатели ИИ и автописем, состояние кассира Kaspi. */
export type OpsSettingKey = "crm.aiTranscribe" | "notify.auto" | "kaspi.watch";
