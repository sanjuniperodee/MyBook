import type { BookBuildManifest, BookPageKind } from "@/lib/book/book-build";
import { BookPreviewService, PrintFilesService, RasterizerMissingError, type BookRenderer, type FileStore, type PageRaster, type PrintJob, type PrintSpec, type RenderQueue } from "@/modules/production";
import type { Clock, Logger } from "@/shared/application";

// ─── тестовые двойники ─────────────────────────────────────────────────────

/**
 * Хранилище в памяти. deletePrefix — как rm -r каталога в настоящем хранилище: ключ целиком или всё под «ключ/».
 * list — имена прямо внутри папки; время изменения — по часам теста (у папки — самой свежей записи в ней), записи
 * в одну миллисекунду различаются долями по порядку. failList — list падает (сбой файловой системы).
 */
class MemFiles implements FileStore {
  data = new Map<string, Buffer>();
  puts: string[] = [];
  failList = false;
  private written = new Map<string, number>();
  constructor(private readonly now: () => number) {}
  async exists(key: string) {
    return this.data.has(key);
  }
  async get(key: string) {
    const v = this.data.get(key);
    if (!v) throw new Error(`ENOENT: ${key}`);
    return v;
  }
  async put(key: string, data: Buffer) {
    this.data.set(key, data);
    this.puts.push(key);
    this.written.set(key, this.now() + this.puts.length / 1000);
  }
  async deletePrefix(prefix: string) {
    for (const k of [...this.data.keys()]) if (k === prefix || k.startsWith(`${prefix}/`)) this.data.delete(k);
  }
  async list(prefix: string) {
    if (this.failList) throw new Error("EIO: list failed");
    const entries = new Map<string, number>();
    for (const k of this.data.keys()) {
      if (!k.startsWith(`${prefix}/`)) continue;
      const name = k.slice(prefix.length + 1).split("/")[0];
      entries.set(name, Math.max(entries.get(name) ?? 0, this.written.get(k) ?? 0));
    }
    return [...entries].map(([name, modifiedMs]) => ({ name, modifiedMs }));
  }
  text(key: string) {
    return this.data.get(key)?.toString();
  }
  keys() {
    return [...this.data.keys()].sort();
  }
}

/** Полосы экранной сборки по умолчанию: 7 с содержимым и одна пустая добивки. */
const SCREEN_PAGES: BookPageKind[] = ["front", "front", "toc", "opener", "text", "text", "end", "pad"];

/**
 * Рендер-заглушка: «PDF» — строки с номером рендера (block#1, reading#2…), calls — журнал вызовов.
 * Книги нет в books — рендер отвечает null, как настоящий адаптер; crash — рендер падает с ошибкой.
 * Экранная сборка — «preview <отпечаток>», водяной знак дописывает к ней « +wm»; pause() — вёрстка экранной сборки
 * ждёт resume() (сборка «идёт»).
 */
class FakeRenderer implements BookRenderer {
  books = new Map<string, { fingerprint: string }>();
  crash = new Set<"package" | "layout" | "reading" | "preview" | "watermark">();
  calls: string[] = [];
  private n = 0;
  private gate: Promise<void> | null = null;
  private open: () => void = () => {};
  pause() {
    this.gate = new Promise((resolve) => (this.open = resolve));
  }
  resume() {
    this.gate = null;
    this.open();
  }
  private step(kind: "package" | "layout" | "reading", bookId: string) {
    if (this.crash.has(kind)) throw new Error(`${kind} crashed`);
    return this.books.has(bookId) ? ++this.n : null;
  }
  async renderPrintPackage(bookId: string, orderNumber: number) {
    this.calls.push(`package:${bookId}:${orderNumber}`);
    const n = this.step("package", bookId);
    if (n === null) return null;
    const printSpec: PrintSpec = { format: "a5", pageCount: 64 + n, spineMm: 8, coverWidthMm: 316, coverHeightMm: 216, generatedAt: "2026-10-01T10:00:00.000Z" };
    return { interior: Buffer.from(`block#${n}`), cover: Buffer.from(`cover#${n}`), layout: Buffer.from(`layout#${n}`), spec: Buffer.from(`spec#${n}`), printSpec };
  }
  async renderLayout(bookId: string, block: Buffer, cover: Buffer) {
    this.calls.push(`layout:${bookId}:${block}+${cover}`);
    return this.step("layout", bookId) === null ? null : Buffer.from(`layout(${block}+${cover})`);
  }
  async renderReading(bookId: string) {
    this.calls.push(`reading:${bookId}`);
    const n = this.step("reading", bookId);
    return n === null ? null : Buffer.from(`reading#${n}`);
  }
  async preview(bookId: string) {
    this.calls.push(`preview:${bookId}`);
    const book = this.books.get(bookId);
    if (!book) return null;
    const fp = book.fingerprint;
    return {
      fingerprint: fp,
      render: async () => {
        this.calls.push(`render:${bookId}:${fp}`);
        if (this.gate) await this.gate;
        if (this.crash.has("preview")) throw new Error("preview crashed");
        const manifest: BookBuildManifest = {
          fp,
          pageCount: SCREEN_PAGES.length,
          contentPages: SCREEN_PAGES.filter((k) => k !== "pad").length,
          trimMm: { w: 148, h: 210 },
          pages: SCREEN_PAGES.map((kind, i) => (kind === "opener" || kind === "text" ? { n: i + 1, kind, chapterKey: "c1" } : { n: i + 1, kind })),
          chapterPages: { c1: 4 },
        };
        return { pdf: Buffer.from(`preview ${fp}`), manifest };
      },
      watermark: async (pdf: Buffer) => {
        this.calls.push(`watermark:${bookId}`);
        if (this.crash.has("watermark")) throw new Error("watermark crashed");
        return Buffer.from(`${pdf} +wm`);
      },
    };
  }
  async manuscript(bookId: string) {
    return this.books.has(bookId) ? { title: "Ты — моё всё", text: "Глава 1" } : null;
  }
}

/**
 * Очередь как настоящая: одновременные задачи с одним ключом склеиваются. requested — все запросы, started — реально
 * запущенные. pause() — слот занят: задачи ждут resume() и запускаются по порядку.
 */
class FakeQueue implements RenderQueue {
  requested: string[] = [];
  started: string[] = [];
  private inflight = new Map<string, Promise<unknown>>();
  private gate: Promise<void> | null = null;
  private open: () => void = () => {};
  pause() {
    this.gate = new Promise((resolve) => (this.open = resolve));
  }
  resume() {
    this.gate = null;
    this.open();
  }
  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    this.requested.push(key);
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;
    const gate = this.gate;
    const start = () => {
      this.started.push(key);
      return task();
    };
    const p = (gate ? gate.then(start) : start()).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }
  /** Дождаться всех задач (и фоновых, результат которых никто не ждёт, и тех, что встают в очередь после них). */
  async idle() {
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (!this.inflight.size) return;
      await Promise.allSettled([...this.inflight.values()]);
    }
  }
}

/**
 * Растр-заглушка: «картинка» — строка с файлом, полосой и шириной; missing — нет pdftoppm. hold() — растр «идёт», пока
 * не release(); signals — с какой отменой его просили (как настоящий: отменили — бросает).
 */
class FakeRaster implements PageRaster {
  calls: string[] = [];
  signals: (AbortSignal | undefined)[] = [];
  missing = false;
  private gate: Promise<void> | null = null;
  private open: () => void = () => {};
  hold() {
    this.gate = new Promise((resolve) => (this.open = resolve));
  }
  release() {
    this.gate = null;
    this.open();
  }
  async page(pdfKey: string, n: number, width: number, _trim?: unknown, signal?: AbortSignal) {
    this.calls.push(`page:${pdfKey}:${n}@${width}`);
    this.signals.push(signal);
    if (this.gate) await this.gate;
    signal?.throwIfAborted();
    if (this.missing) throw new RasterizerMissingError();
    return Buffer.from(`page ${n}@${width} of ${pdfKey}`);
  }
  async blank(width: number) {
    this.calls.push(`blank@${width}`);
    return Buffer.from(`blank@${width}`);
  }
}

/** Часы, которые двигает тест. */
class TestClock implements Clock {
  ms = Date.parse("2026-10-22T10:00:00Z");
  now() {
    return new Date(this.ms);
  }
}

class SpyLogger implements Logger {
  errors: { message: string; error: unknown }[] = [];
  warns: string[] = [];
  info() {}
  warn(message: string) {
    this.warns.push(message);
  }
  error(message: string, error?: unknown) {
    this.errors.push({ message, error });
  }
}

/** Заказ №7 на книгу b1. */
export const job: PrintJob = { orderId: "o1", bookId: "b1", number: 7 };

export function setup() {
  const renderer = new FakeRenderer();
  const clock = new TestClock();
  const files = new MemFiles(() => clock.ms);
  const queue = new FakeQueue();
  const raster = new FakeRaster();
  const logger = new SpyLogger();
  const paid = new Set<string>();
  renderer.books.set("b1", { fingerprint: "fp1" });
  return {
    renderer,
    files,
    queue,
    raster,
    clock,
    logger,
    pay: (bookId: string) => void paid.add(bookId),
    printFiles: new PrintFilesService(renderer, files, queue, logger),
    previews: new BookPreviewService(renderer, files, queue, raster, logger, async (bookId) => paid.has(bookId), clock),
  };
}
