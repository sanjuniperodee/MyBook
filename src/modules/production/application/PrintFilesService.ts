import type { Logger } from "@/shared/application";

export type PrintFileKind = "block" | "cover" | "layout" | "spec" | "reading";

/** Что печатаем: заказ и его книга. */
export interface PrintJob {
  orderId: string;
  bookId: string;
  number: number;
}

export interface PrintSpec {
  format: string;
  pageCount: number;
  spineMm: number;
  coverWidthMm: number;
  coverHeightMm: number;
  generatedAt: string;
}

/** Порт рендера: PDF блока, обложки и читательской версии. */
export interface BookRenderer {
  renderPrintPackage(bookId: string, orderNumber: number): Promise<{ interior: Buffer; cover: Buffer; layout: Buffer; spec: Buffer; printSpec: PrintSpec } | null>;
  /** Каркас обложки (поверх готовой обложки) и схема блока по готовым PDF блока и обложки (для заказов, собранных до появления чертежа). */
  renderLayout(bookId: string, orderNumber: number, block: Buffer, cover: Buffer): Promise<Buffer | null>;
  renderReading(bookId: string): Promise<Buffer | null>;
  /** Предпросмотр: отпечаток содержимого (ключ кэша) и отложенный рендер. */
  preview(bookId: string): Promise<{ fingerprint: string; render(): Promise<Buffer> } | null>;
  /** Текст книги одним файлом. */
  manuscript(bookId: string): Promise<{ title: string; text: string } | null>;
}

/** Порт файлового хранилища. */
export interface FileStore {
  exists(key: string): Promise<boolean>;
  get(key: string): Promise<Buffer>;
  put(key: string, data: Buffer): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
}

/** Ограничение параллельных рендеров и склейка одинаковых запросов. */
export interface RenderQueue {
  run<T>(key: string, task: () => Promise<T>): Promise<T>;
}

/**
 * Файлы для типографии и читательская версия книги. Рендер дорогой, поэтому результат
 * кэшируется в хранилище, а одинаковые запросы склеиваются.
 */
export class PrintFilesService {
  constructor(
    private readonly renderer: BookRenderer,
    private readonly files: FileStore,
    private readonly queue: RenderQueue,
    private readonly logger: Logger,
  ) {}

  private key(orderId: string, kind: PrintFileKind) {
    return `orders/${orderId}/${kind === "spec" ? "spec.txt" : `${kind}.pdf`}`;
  }

  /** Сгенерировать файлы для печати (или взять готовые). Возвращает параметры печати, если рендерили. */
  async prepare(job: PrintJob, opts: { force?: boolean } = {}): Promise<PrintSpec | null> {
    const keys = { block: this.key(job.orderId, "block"), cover: this.key(job.orderId, "cover"), spec: this.key(job.orderId, "spec") };
    if (!opts.force && (await this.files.exists(keys.block)) && (await this.files.exists(keys.cover)) && (await this.files.exists(keys.spec))) return null;
    return this.queue.run(`print:${job.orderId}`, async () => {
      const pkg = await this.renderer.renderPrintPackage(job.bookId, job.number);
      if (!pkg) throw new Error(`book ${job.bookId} not found`);
      await this.files.put(keys.block, pkg.interior);
      await this.files.put(keys.cover, pkg.cover);
      await this.files.put(keys.spec, pkg.spec);
      await this.files.put(this.key(job.orderId, "layout"), pkg.layout);
      return pkg.printSpec;
    });
  }

  async getFile(job: PrintJob, kind: PrintFileKind, opts: { force?: boolean } = {}): Promise<Buffer> {
    const key = this.key(job.orderId, kind);
    if (kind === "reading") {
      if (!opts.force && (await this.files.exists(key))) return this.files.get(key);
      return this.queue.run(`reading:${job.orderId}`, async () => {
        const pdf = await this.renderer.renderReading(job.bookId);
        if (!pdf) throw new Error(`book ${job.bookId} not found`);
        await this.files.put(key, pdf);
        return pdf;
      });
    }
    await this.prepare(job, opts);
    if (kind === "layout" && !(await this.files.exists(key))) {
      const [block, cover] = await Promise.all([this.files.get(this.key(job.orderId, "block")), this.files.get(this.key(job.orderId, "cover"))]);
      const pdf = await this.queue.run(`layout:${job.orderId}`, () => this.renderer.renderLayout(job.bookId, job.number, block, cover));
      if (!pdf) throw new Error(`book ${job.bookId} not found`);
      await this.files.put(key, pdf);
      return pdf;
    }
    return this.files.get(key);
  }

  /** После оплаты: готовим всё заранее, чтобы клиент и типография скачивали мгновенно. */
  async warmUp(job: PrintJob): Promise<PrintSpec | null> {
    try {
      const spec = await this.prepare(job);
      await this.getFile(job, "reading");
      return spec;
    } catch (err) {
      this.logger.error(`warm-up failed for order ${job.number}`, err);
      return null;
    }
  }
}

/**
 * Предпросмотр книги для автора (с водяным знаком и облегчёнными фото) и выгрузка текста.
 * PDF кэшируется по отпечатку содержимого, пока книга не изменилась; старые версии удаляются.
 */
export class BookPreviewService {
  constructor(
    private readonly renderer: BookRenderer,
    private readonly files: FileStore,
    private readonly queue: RenderQueue,
  ) {}

  async preview(bookId: string): Promise<Buffer | null> {
    const draft = await this.renderer.preview(bookId);
    if (!draft) return null;
    const key = `cache/preview/${bookId}/${draft.fingerprint}.pdf`;
    if (await this.files.exists(key)) return this.files.get(key);
    return this.queue.run(key, async () => {
      const pdf = await draft.render();
      await this.files.deletePrefix(`cache/preview/${bookId}`);
      await this.files.put(key, pdf);
      return pdf;
    });
  }

  manuscript(bookId: string) {
    return this.renderer.manuscript(bookId);
  }
}
