/** Порт фоновой работы процесса-воркера (ADR 0014, шаг 6): та же работа, что у прежнего mybook-worker. */
export const WORKER_PORTS = Symbol("WorkerPorts");

export interface WorkerPorts {
  /** Память sharp и замеры памяти процессов. */
  prepare(): Promise<void>;
  /** Дождаться всех миграций релиза в базе (не дольше 10 минут). */
  waitForMigrations(): Promise<void>;
  /** Запустить фон: каталог, планировщик, outbox, бот, сверки, очередь видео. */
  start(): Promise<void>;
}
