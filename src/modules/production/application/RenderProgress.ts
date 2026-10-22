import { systemClock, type Clock } from "@/shared/application";
import type { BuildProgress, RenderStageName } from "@/lib/book/book-build";
import type { FileStore } from "./PrintFilesService";

/** Этапы сборки PDF в порядке выполнения: картинки (фото под печать), доводка вёрстки, итоговая сборка, обложка, упаковка файлов. */
export type RenderStage = RenderStageName;

/** Что собираем: пакет для печати, читательская версия, каркас обложки, экранная сборка (предпросмотр). */
export type RenderKind = "package" | "reading" | "layout" | "screen";

/** Что рендер сообщает о ходе работы: начался этап; size — размер книги (оценка страниц и фото), от него зависит срок. */
export interface RenderEvent {
  stage: RenderStage;
  size?: number;
}
export type RenderReport = (event: RenderEvent) => void;

/** Этапы, которые проходит каждый вид работы. */
const STAGES: Record<RenderKind, readonly RenderStage[]> = {
  package: ["images", "flow", "final", "cover", "finish"],
  reading: ["images", "flow", "final", "finish"],
  screen: ["images", "flow", "final", "finish"],
  layout: ["finish"],
};

/** Каркас обложки не зависит от объёма книги. */
const FIXED_SIZE: Partial<Record<RenderKind, number>> = { layout: 1 };

/**
 * Как срок этапа растёт с размером книги. Доводка вёрстки — каждый проход собирает весь блок, а проходов
 * тем больше, чем длиннее книга (см. MAX_FLOW_PASSES в render.tsx), поэтому она растёт быстрее остальных;
 * обложка от объёма почти не зависит.
 */
const EXPONENT: Record<RenderStage, number> = { images: 1, flow: 2, final: 1, cover: 0, finish: 0 };

/**
 * Сколько мс занимает этап на единицу размера (в степени EXPONENT) — пока замеров нет: оценки по сборкам на
 * разработческой машине с запасом на сервер. Дальше их заменяет скользящее среднее по настоящим сборкам (RenderProgress.learn).
 */
const SEED_RATES: Record<string, number> = {
  "package:images": 2,
  "package:flow": 0.5,
  "package:final": 4,
  "package:cover": 250,
  "package:finish": 20,
  "reading:images": 1.5,
  "reading:flow": 0.5,
  "reading:final": 4,
  "reading:finish": 15,
  "screen:images": 1,
  "screen:flow": 0.5,
  "screen:final": 4,
  "screen:finish": 300,
  "layout:finish": 300,
};

/** Вес нового замера в скользящем среднем. */
const RATE_WEIGHT = 0.4;
/** Внутри этапа полоса не доходит до конца, пока этап не закончился: «99%» без готового файла — вранье. */
const STAGE_CAP = 0.95;
const MIN_STAGE_MS = 50;
const RATES_KEY = "cache/render-rates.json";

/** Состояние сборки для экрана. */
export interface RenderSnapshot extends BuildProgress {
  kind: RenderKind;
  elapsedMs: number;
}

interface Job {
  kind: RenderKind;
  queuedAt: number;
  startedAt?: number;
  size?: number;
  stage?: RenderStage;
  /** Когда начался каждый пройденный этап. */
  marks: Partial<Record<RenderStage, number>>;
}

/**
 * Ход сборок PDF: рендер сообщает, какой этап начался, а срок «осталось» считается по замерам прошлых сборок —
 * на каждый этап и единицу размера книги; замеры сохраняются между перезапусками. react-pdf не умеет докладывать
 * о ходе внутри этапа, поэтому внутри этапа полоса идёт по времени, а смена этапа — по настоящему событию: полоса
 * ни разу не откатывается назад и не показывает 100%, пока файл не готов.
 * Ключ сборки тот же, что у очереди рендера (`print:<заказ>`, `reading:<заказ>`…).
 */
export class RenderProgress {
  private readonly jobs = new Map<string, Job>();
  private rates: Record<string, number> = { ...SEED_RATES };

  constructor(
    private readonly store?: Pick<FileStore, "exists" | "get" | "put">,
    private readonly clock: Clock = systemClock,
  ) {
    void this.restore();
  }

  private now() {
    return this.clock.now().getTime();
  }

  /** Замеры прошлых запусков; нет файла или он испорчен — остаются начальные оценки. */
  private async restore() {
    try {
      if (!this.store || !(await this.store.exists(RATES_KEY))) return;
      const saved = JSON.parse((await this.store.get(RATES_KEY)).toString("utf8")) as Record<string, unknown>;
      for (const [k, v] of Object.entries(saved)) if (k in SEED_RATES && typeof v === "number" && Number.isFinite(v) && v > 0) this.rates[k] = v;
    } catch {
      // Испорченные замеры — не повод ронять сборку.
    }
  }

  /** Сборка встала в очередь. Повторный вызов с тем же ключом (склеенные запросы) ничего не меняет. */
  queued(key: string, kind: RenderKind) {
    if (!this.jobs.has(key)) this.jobs.set(key, { kind, queuedAt: this.now(), marks: {} });
  }

  /** Сборка получила место и пошла. */
  private start(key: string) {
    const job = this.jobs.get(key);
    if (!job) return;
    const now = this.now();
    job.startedAt = now;
    job.size = FIXED_SIZE[job.kind];
    job.stage = STAGES[job.kind][0];
    job.marks[job.stage] = now;
  }

  private report(key: string, e: RenderEvent) {
    const job = this.jobs.get(key);
    if (!job?.startedAt) return;
    if (e.size && e.size > 0 && !FIXED_SIZE[job.kind]) job.size = e.size;
    const order = STAGES[job.kind];
    // Этапы идут только вперёд: повторное событие того же этапа (проход вёрстки) срок не сбрасывает.
    if (order.indexOf(e.stage) <= order.indexOf(job.stage ?? order[0])) return;
    job.stage = e.stage;
    job.marks[e.stage] = this.now();
  }

  /**
   * Сборка прошла слот: task получает report и вызывает его по ходу работы. Удачная сборка пополняет замеры,
   * любой исход — убирает запись.
   */
  async track<T>(key: string, task: (report: RenderReport) => Promise<T>): Promise<T> {
    this.start(key);
    try {
      const result = await task((e) => this.report(key, e));
      this.learn(key);
      return result;
    } finally {
      this.jobs.delete(key);
    }
  }

  /** Замеры этапов этой сборки — в скользящее среднее и на диск. */
  private learn(key: string) {
    const job = this.jobs.get(key);
    if (!job?.startedAt || !job.size) return;
    const end = this.now();
    const reached = STAGES[job.kind].filter((s) => job.marks[s] !== undefined);
    reached.forEach((stage, i) => {
      const from = job.marks[stage]!;
      const to = i + 1 < reached.length ? job.marks[reached[i + 1]]! : end;
      const rate = Math.max(0, to - from) / job.size! ** EXPONENT[stage];
      const k = `${job.kind}:${stage}`;
      if (rate > 0) this.rates[k] = (this.rates[k] ?? rate) * (1 - RATE_WEIGHT) + rate * RATE_WEIGHT;
    });
    void this.store?.put(RATES_KEY, Buffer.from(JSON.stringify(this.rates))).catch(() => undefined);
  }

  /** Состояние сборки; null — такой сборки сейчас нет. */
  snapshot(key: string): RenderSnapshot | null {
    const job = this.jobs.get(key);
    if (!job) return null;
    const now = this.now();
    // Карта хранит сборки в порядке постановки в очередь: перед этой стоят все, что записаны раньше.
    const ahead = [...this.jobs.values()].indexOf(job);
    if (!job.startedAt || !job.stage) return { kind: job.kind, state: "queued", stage: null, percent: 0, etaMs: null, overrun: false, elapsedMs: now - job.queuedAt, ahead };
    const order = STAGES[job.kind];
    const size = job.size ?? 1;
    const expected = order.map((s) => Math.max(MIN_STAGE_MS, (this.rates[`${job.kind}:${s}`] ?? 0) * size ** EXPONENT[s]));
    const at = order.indexOf(job.stage);
    const total = expected.reduce((a, b) => a + b, 0);
    const doneBefore = expected.slice(0, at).reduce((a, b) => a + b, 0);
    const inStage = now - (job.marks[job.stage] ?? now);
    const later = expected.slice(at + 1).reduce((a, b) => a + b, 0);
    return {
      kind: job.kind,
      state: "running",
      stage: job.stage,
      percent: Math.min(99, Math.floor(((doneBefore + Math.min(inStage, expected[at] * STAGE_CAP)) / total) * 100)),
      etaMs: Math.round(Math.max(0, expected[at] - inStage) + later),
      overrun: inStage > expected[at],
      elapsedMs: now - job.startedAt,
      ahead,
    };
  }

  /** Сборки заказа: ключи очереди рендера оканчиваются на «:<заказ>». */
  forOrder(orderId: string): RenderSnapshot[] {
    return [...this.jobs.keys()].filter((k) => k.endsWith(`:${orderId}`)).flatMap((k) => this.snapshot(k) ?? []);
  }

  /** Экранная сборка книги (ключ очереди `screen:<книга>:<номер>`): идущая, а если нет — ближайшая в очереди. */
  forBook(bookId: string): RenderSnapshot | null {
    const mine = [...this.jobs.keys()].filter((k) => k.startsWith(`screen:${bookId}:`)).flatMap((k) => this.snapshot(k) ?? []);
    return mine.find((j) => j.state === "running") ?? mine[0] ?? null;
  }
}
