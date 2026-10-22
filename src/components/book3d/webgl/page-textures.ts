/** Полоса для стороны листа: ключ стороны, версия картинки (сборка и номер полосы) и адрес; null — пустая полоса. */
export interface PageJob<K extends string = string> {
  key: K;
  id: string;
  url: string | null;
}

/** Картинка, которую можно отпустить: ImageBitmap (close освобождает декодированные пиксели). */
export interface Closable {
  close(): void;
}

/** Сколько картинок грузим одновременно: остальные ждут очереди в порядке важности. */
const LIMIT = 3;

/** Не загрузилась — пробуем ещё через 2 с, потом через 8 с; дальше — только если полоса уйдёт из окна и вернётся. */
const RETRY_MS = [2_000, 8_000];

/** Картинка полосы: из сети (или HTTP-кэша — ответ неизменяемый) сразу в ImageBitmap, без <img> в памяти страницы. */
export async function fetchBitmap(url: string, signal: AbortSignal): Promise<ImageBitmap> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`page image ${res.status}`);
  const blob = await res.blob();
  signal.throwIfAborted();
  return createImageBitmap(blob);
}

/** Что сообщает загрузчик о сбое: final — повторов больше не будет, пока полоса в окне. */
export type PageFailure<K extends string> = { key: K; id: string; final: boolean };

/**
 * Картинки полос для сторон листов. Грузит только то, что просят (want — полосы возле разворота, по важности),
 * не больше LIMIT сразу; ушедшее из окна отменяет на лету или отпускает (apply(key, null)). Смена сборки не
 * мигает белым: старая картинка стоит, пока не загрузилась новая; не загрузилась — старую снимаем (чистый лист
 * лучше полосы прошлой версии рядом с новыми) и повторяем по RETRY_MS. Каждый сбой — в onFailure.
 */
export class PageTextures<K extends string, T extends Closable> {
  private jobs: PageJob<K>[] = [];
  /** Что стоит на стороне листа: id картинки. */
  private readonly shown = new Map<K, string>();
  private readonly loading = new Map<K, { id: string; ctrl: AbortController }>();
  /** Не загрузившиеся картинки: сколько раз и ждёт ли повтора (по таймеру). */
  private readonly failed = new Map<string, { attempts: number; waiting: boolean }>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private disposed = false;

  constructor(
    private readonly apply: (key: K, image: T | null) => void,
    /** Загрузка картинки по адресу: в браузере — fetchBitmap. */
    private readonly load: (url: string, signal: AbortSignal) => Promise<T>,
    private readonly limit = LIMIT,
    private readonly onFailure?: (failure: PageFailure<K>) => void,
    private readonly retryMs: readonly number[] = RETRY_MS,
  ) {}

  /** Нужные стороны по важности; всё остальное — отменить или отпустить. */
  want(jobs: PageJob<K>[]) {
    if (this.disposed) return;
    this.jobs = jobs;
    const byKey = new Map(jobs.map((j) => [j.key, j]));
    for (const [key, l] of this.loading)
      if (byKey.get(key)?.id !== l.id) {
        l.ctrl.abort();
        this.loading.delete(key);
      }
    for (const key of [...this.shown.keys()]) {
      const job = byKey.get(key);
      // Вне окна или теперь пустая полоса — картинку отпускаем; другая полоса той же стороны сменит её сама.
      if (!job || job.url === null) {
        this.shown.delete(key);
        this.apply(key, null);
      }
    }
    // Ушла из окна — сбой забываем: вернётся — пробуем снова.
    const ids = new Set(jobs.map((j) => j.id));
    for (const id of this.failed.keys()) if (!ids.has(id)) this.failed.delete(id);
    this.pump();
  }

  /** Кнопка «Попробовать снова»: забыть сбои и загрузить окно заново. */
  retryFailed() {
    this.failed.clear();
    this.pump();
  }

  /** Картинки пропали вместе с видеопамятью (контекст WebGL восстановлен): загрузить всё окно заново. */
  reset() {
    for (const l of this.loading.values()) l.ctrl.abort();
    this.loading.clear();
    this.shown.clear();
    this.failed.clear();
    this.want(this.jobs);
  }

  dispose() {
    this.disposed = true;
    for (const l of this.loading.values()) l.ctrl.abort();
    this.loading.clear();
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private pump() {
    for (const job of this.jobs) {
      if (this.disposed || this.loading.size >= this.limit) return;
      const failure = this.failed.get(job.id);
      if (failure && (failure.waiting || failure.attempts > this.retryMs.length)) continue;
      if (job.url === null || this.shown.get(job.key) === job.id || this.loading.has(job.key)) continue;
      this.start(job, job.url);
    }
  }

  private start(job: PageJob<K>, url: string) {
    const ctrl = new AbortController();
    this.loading.set(job.key, { id: job.id, ctrl });
    // Ответ на отменённую загрузку уже не нужен: сторона ждёт другую полосу или ушла из окна.
    const current = () => this.loading.get(job.key)?.ctrl === ctrl;
    this.load(url, ctrl.signal)
      .then(
        (image) => {
          if (!current() || this.disposed) return image.close();
          this.loading.delete(job.key);
          this.failed.delete(job.id);
          this.shown.set(job.key, job.id);
          this.apply(job.key, image);
        },
        (error: unknown) => {
          if (!current() || this.disposed) return;
          this.loading.delete(job.key);
          // На листе полоса прошлой сборки — снимаем: новая не пришла, а старая уже не та, что в книге.
          if (this.shown.has(job.key) && this.shown.get(job.key) !== job.id) {
            this.shown.delete(job.key);
            this.apply(job.key, null);
          }
          const attempts = (this.failed.get(job.id)?.attempts ?? 0) + 1;
          const delay = this.retryMs[attempts - 1];
          this.failed.set(job.id, { attempts, waiting: delay !== undefined });
          if (delay !== undefined) {
            const timer = setTimeout(() => {
              this.timers.delete(timer);
              const f = this.failed.get(job.id);
              if (f) f.waiting = false;
              this.pump();
            }, delay);
            this.timers.add(timer);
          }
          console.warn("book page image failed", url, error);
          this.onFailure?.({ key: job.key, id: job.id, final: delay === undefined });
        },
      )
      .finally(() => this.pump());
  }
}
