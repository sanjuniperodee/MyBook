import type { Clock, Logger } from "@/shared/application";
import { OPS_JOBS, isOpsJob } from "@/shared/domain/opsHealth";
import type { PulseRecord, PulseStore } from "./ports";

const ERROR_MAX = 500;
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err)).replace(/\s+/g, " ").trim().slice(0, ERROR_MAX) || "ошибка";
const everyOf = (job: string) => (isOpsJob(job) ? OPS_JOBS[job].every : null);

/**
 * Один проход задания (и его шаги): начало, итог, ошибки. Пульс пишется одним запросом в конце прохода; сбой записи
 * пульса — только в лог, задание из-за него не падает.
 */
export class PulsePass {
  private readonly startedAt: Date;
  private readonly steps: PulseRecord[] = [];
  private outcome: "ok" | "error" | "off" = "ok";
  private error: string | null = null;
  private note: string | null = null;

  constructor(
    private readonly job: string,
    private readonly store: PulseStore,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {
    this.startedAt = clock.now();
  }

  /** Записать начало сразу (долгие проходы — видно, что идёт и не завис ли). */
  async begin(): Promise<void> {
    await this.store.start(this.job, everyOf(this.job), this.startedAt).catch((err) => this.logger.error(`pulse start ${this.job}`, err));
  }

  /**
   * Шаг прохода: ошибка шага пишется в лог с его именем и пульсом шага и не обрывает проход — следующие шаги
   * выполняются, а шаг возвращает fallback.
   */
  async step<T>(name: string, run: () => Promise<T>, fallback: T, onError?: (err: unknown) => void): Promise<T> {
    const startedAt = this.clock.now();
    try {
      const result = await run();
      this.steps.push({ job: name, everySec: everyOf(name), startedAt, finishedAt: this.clock.now(), outcome: "ok", error: null, note: null });
      return result;
    } catch (err) {
      onError?.(err);
      this.steps.push({ job: name, everySec: everyOf(name), startedAt, finishedAt: this.clock.now(), outcome: "error", error: errorText(err), note: null });
      return fallback;
    }
  }

  /** Задание выключено (Kaspi не подключён): проход был, проверять нечего. */
  off(): this {
    if (this.outcome === "ok") this.outcome = "off";
    return this;
  }

  fail(err: unknown): this {
    this.outcome = "error";
    this.error = errorText(err);
    return this;
  }

  /** Короткий итог прохода (номер заказа и т. п.). */
  noted(note: string | null): this {
    this.note = note ? note.slice(0, 200) : null;
    return this;
  }

  /** Конец прохода: пульс прохода и шагов одним запросом. */
  async done(): Promise<void> {
    const pass: PulseRecord = { job: this.job, everySec: everyOf(this.job), startedAt: this.startedAt, finishedAt: this.clock.now(), outcome: this.outcome, error: this.error, note: this.note };
    await this.store.finish([pass, ...this.steps]).catch((err) => this.logger.error(`pulse ${this.job}`, err));
  }
}

/** Пульс фоновых заданий: планировщик, сверки, сборка файлов для печати. */
export class PulseRecorder {
  constructor(
    private readonly store: PulseStore,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  pass(job: string): PulsePass {
    return new PulsePass(job, this.store, this.clock, this.logger);
  }

  /**
   * Задание по событию (сборка файлов после оплаты): выполнить и записать итог. failed(result) — текст сбоя, если
   * задание само ошибку не бросает, а сообщает итогом.
   */
  async track<T>(job: string, run: () => Promise<T>, failed?: (result: T) => string | null): Promise<T> {
    const p = this.pass(job);
    try {
      const result = await run();
      const why = failed?.(result);
      if (why) p.fail(why);
      return result;
    } catch (err) {
      p.fail(err);
      throw err;
    } finally {
      await p.done();
    }
  }
}
