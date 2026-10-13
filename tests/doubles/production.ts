import { BookPreviewService, PrintFilesService, type BookRenderer, type FileStore, type PrintJob, type PrintSpec, type RenderQueue } from "@/modules/production";
import type { Logger } from "@/shared/application";

// ─── тестовые двойники ─────────────────────────────────────────────────────

/** Хранилище в памяти. deletePrefix — как rm -r каталога в настоящем хранилище: ключ целиком или всё под «ключ/». */
class MemFiles implements FileStore {
  data = new Map<string, Buffer>();
  puts: string[] = [];
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
  }
  async deletePrefix(prefix: string) {
    for (const k of [...this.data.keys()]) if (k === prefix || k.startsWith(`${prefix}/`)) this.data.delete(k);
  }
  text(key: string) {
    return this.data.get(key)?.toString();
  }
  keys() {
    return [...this.data.keys()].sort();
  }
}

/**
 * Рендер-заглушка: «PDF» — строки с номером рендера (block#1, reading#2…), calls — журнал вызовов.
 * Книги нет в books — рендер отвечает null, как настоящий адаптер; crash — рендер падает с ошибкой.
 */
class FakeRenderer implements BookRenderer {
  books = new Map<string, { fingerprint: string }>();
  crash = new Set<"package" | "layout" | "reading">();
  calls: string[] = [];
  private n = 0;
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
  async preview(bookId: string, opts?: { watermark?: boolean }) {
    const mark = opts?.watermark ? "wm" : "clean";
    this.calls.push(`preview:${bookId}:${mark}`);
    const book = this.books.get(bookId);
    if (!book) return null;
    return {
      fingerprint: book.fingerprint,
      render: async () => {
        this.calls.push(`render:${bookId}`);
        return Buffer.from(`preview ${book.fingerprint} ${mark}`);
      },
    };
  }
  async manuscript(bookId: string) {
    return this.books.has(bookId) ? { title: "Ты — моё всё", text: "Глава 1" } : null;
  }
}

/** Очередь как настоящая: одновременные задачи с одним ключом склеиваются. requested — все запросы, started — реально запущенные. */
class FakeQueue implements RenderQueue {
  requested: string[] = [];
  started: string[] = [];
  private inflight = new Map<string, Promise<unknown>>();
  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    this.requested.push(key);
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;
    this.started.push(key);
    const p = task().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }
}

class SpyLogger implements Logger {
  errors: { message: string; error: unknown }[] = [];
  info() {}
  warn() {}
  error(message: string, error?: unknown) {
    this.errors.push({ message, error });
  }
}

/** Заказ №7 на книгу b1. */
export const job: PrintJob = { orderId: "o1", bookId: "b1", number: 7 };

export function setup() {
  const renderer = new FakeRenderer();
  const files = new MemFiles();
  const queue = new FakeQueue();
  const logger = new SpyLogger();
  const paid = new Set<string>();
  renderer.books.set("b1", { fingerprint: "fp1" });
  return {
    renderer,
    files,
    queue,
    logger,
    pay: (bookId: string) => void paid.add(bookId),
    printFiles: new PrintFilesService(renderer, files, queue, logger),
    previews: new BookPreviewService(renderer, files, queue, async (bookId) => paid.has(bookId)),
  };
}
