import { systemClock, type Clock, type Logger } from "@/shared/application";
import { buildImageBase, type BookBuild, type BookBuildManifest, type BookBuildState, type BuildProgress, type PageImageWidth } from "@/lib/book/book-build";
import { RenderProgress, type RenderKind, type RenderReport } from "./RenderProgress";

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

/** Порт рендера: PDF блока, обложки и читательской версии. report — рендер докладывает, какой этап начался (RenderProgress). */
export interface BookRenderer {
  renderPrintPackage(bookId: string, orderNumber: number, report?: RenderReport): Promise<{ interior: Buffer; cover: Buffer; layout: Buffer; spec: Buffer; printSpec: PrintSpec } | null>;
  /** Каркас — готовая обложка с рамками крышек и корешка — по готовым PDF блока и обложки (для заказов, собранных до появления каркаса). */
  renderLayout(bookId: string, block: Buffer, cover: Buffer, report?: RenderReport): Promise<Buffer | null>;
  renderReading(bookId: string, report?: RenderReport): Promise<Buffer | null>;
  /**
   * Экранная сборка — единственная вёрстка всех предпросмотров: отпечаток содержимого (ключ кэша), отложенный рендер
   * (PDF без водяного знака и манифест его полос) и водяной знак «Предпросмотр» поверх готового PDF этой книги.
   */
  preview(bookId: string): Promise<ScreenDraft | null>;
  /** Текст книги одним файлом. */
  manuscript(bookId: string): Promise<{ title: string; text: string } | null>;
}

/** Экранная сборка книги до рендера: отпечаток считается сразу, сама вёрстка — по render(). */
export interface ScreenDraft {
  fingerprint: string;
  render(report?: RenderReport): Promise<{ pdf: Buffer; manifest: BookBuildManifest }>;
  /** Знак ставится поверх полос: вёрстка под ним не меняется. */
  watermark(pdf: Buffer): Promise<Buffer>;
}

/** Порт файлового хранилища. */
export interface FileStore {
  exists(key: string): Promise<boolean>;
  get(key: string): Promise<Buffer>;
  /** Запись целиком или никак: оборванная (перезапуск, нет места) не оставляет под ключом обрезанный файл — только <ключ>.tmp-…. */
  put(key: string, data: Buffer): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
  /** Файлы и папки прямо внутри prefix (имя и время изменения, мс); нет папки — пусто. */
  list(prefix: string): Promise<{ name: string; modifiedMs: number }[]>;
}

/** Порт растра полос готового PDF. */
export interface PageRaster {
  /**
   * Полоса n (с 1) PDF экранной сборки из хранилища в WebP шириной width px — ровно обрезной формат trimMm, без вылетов.
   * signal отменён — растр не нужен: в очереди пропускается, идущий прерывается.
   */
  page(pdfKey: string, n: number, width: number, trimMm: { w: number; h: number }, signal?: AbortSignal): Promise<Buffer>;
  /** Белая полоса тех же пропорций — для пустых полос добивки. */
  blank(width: number, trimMm: { w: number; h: number }): Promise<Buffer>;
}

const RASTERIZER_MISSING = Symbol.for("mybook.rasterizer-missing");

/** Нет программы растра (pdftoppm из poppler-utils): маршрут полос отвечает 503. */
export class RasterizerMissingError extends Error {
  readonly [RASTERIZER_MISSING] = true;
  constructor() {
    super("pdftoppm not found (poppler-utils)");
  }
  /** По метке, а не instanceof: класс в разных слоях бандла Next.js загружается заново. */
  static is(err: unknown): err is RasterizerMissingError {
    return typeof err === "object" && err !== null && (err as Record<symbol, unknown>)[RASTERIZER_MISSING] === true;
  }
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
    /** Ход сборок: экран заказа спрашивает его, пока файлы готовятся. */
    private readonly progress: RenderProgress = new RenderProgress(),
  ) {}

  private key(orderId: string, kind: PrintFileKind) {
    return `orders/${orderId}/${kind === "spec" ? "spec.txt" : `${kind}.pdf`}`;
  }

  /** Сборка в очереди рендера под ключом key; ход виден через RenderProgress. */
  private render<T>(key: string, kind: RenderKind, task: (report: RenderReport) => Promise<T>): Promise<T> {
    this.progress.queued(key, kind);
    return this.queue.run(key, () => this.progress.track(key, task));
  }

  /** Сгенерировать файлы для печати (или взять готовые). Возвращает параметры печати, если рендерили. */
  async prepare(job: PrintJob, opts: { force?: boolean } = {}): Promise<PrintSpec | null> {
    const keys = { block: this.key(job.orderId, "block"), cover: this.key(job.orderId, "cover"), spec: this.key(job.orderId, "spec") };
    if (!opts.force && (await this.files.exists(keys.block)) && (await this.files.exists(keys.cover)) && (await this.files.exists(keys.spec))) return null;
    return this.render(`print:${job.orderId}`, "package", async (report) => {
      const pkg = await this.renderer.renderPrintPackage(job.bookId, job.number, report);
      if (!pkg) throw new Error(`book ${job.bookId} not found`);
      await this.files.put(keys.block, pkg.interior);
      await this.files.put(keys.cover, pkg.cover);
      await this.files.put(keys.spec, pkg.spec);
      await this.files.put(this.key(job.orderId, "layout"), pkg.layout);
      // Читательская версия собрана из той же книги: после пересборки пакета старую не отдаём, при запросе она соберётся заново.
      await this.files.deletePrefix(this.key(job.orderId, "reading"));
      return pkg.printSpec;
    });
  }

  async getFile(job: PrintJob, kind: PrintFileKind, opts: { force?: boolean } = {}): Promise<Buffer> {
    const key = this.key(job.orderId, kind);
    if (kind === "reading") {
      if (!opts.force && (await this.files.exists(key))) return this.files.get(key);
      return this.render(`reading:${job.orderId}`, "reading", async (report) => {
        const pdf = await this.renderer.renderReading(job.bookId, report);
        if (!pdf) throw new Error(`book ${job.bookId} not found`);
        await this.files.put(key, pdf);
        return pdf;
      });
    }
    await this.prepare(job, opts);
    if (kind === "layout" && !(await this.files.exists(key))) {
      const [block, cover] = await Promise.all([this.files.get(this.key(job.orderId, "block")), this.files.get(this.key(job.orderId, "cover"))]);
      const pdf = await this.render(`layout:${job.orderId}`, "layout", (report) => this.renderer.renderLayout(job.bookId, block, cover, report));
      if (!pdf) throw new Error(`book ${job.bookId} not found`);
      await this.files.put(key, pdf);
      return pdf;
    }
    return this.files.get(key);
  }

  /**
   * Подготовить файл, не читая его в память: страница ждёт готовности (показывая ход сборки), а само скачивание
   * потом идёт из кэша. Сборка и кэш — те же, что у getFile.
   */
  async ensure(job: PrintJob, kind: PrintFileKind, opts: { force?: boolean } = {}): Promise<void> {
    const key = this.key(job.orderId, kind);
    if (kind === "reading") {
      if (opts.force || !(await this.files.exists(key))) await this.getFile(job, kind, opts);
      return;
    }
    await this.prepare(job, opts);
    if (kind === "layout" && !(await this.files.exists(key))) await this.getFile(job, kind);
  }

  /**
   * После оплаты: готовим всё заранее, чтобы клиент и типография скачивали мгновенно. Не бросает: сбой — в лог.
   * status: rendered — пакет для печати собран сейчас (spec — его параметры), cached — уже был готов, failed — сбой;
   * при сбое читательской версии собранный пакет и его параметры не теряются (B12).
   */
  async warmUp(job: PrintJob): Promise<{ status: "rendered" | "cached" | "failed"; spec: PrintSpec | null }> {
    let spec: PrintSpec | null = null;
    try {
      spec = await this.prepare(job);
      await this.getFile(job, "reading");
      return spec ? { status: "rendered", spec } : { status: "cached", spec: null };
    } catch (err) {
      this.logger.error(`warm-up failed for order ${job.number}`, err);
      return { status: "failed", spec };
    }
  }
}

/**
 * Сколько ждём перед новой попыткой после 1-го, 2-го, 3-го сбоя сборки подряд с тем же отпечатком: сбой по отпечатку
 * обычно повторяется (содержимое то же), а попытка держит единственный слот рендера минутами — и печать оплаченных
 * заказов ждёт. После последнего — не повторяем, пока книга не изменится (или до перезапуска, то есть выкатки с исправлением).
 */
const FAILED_HOLDS_MS = [60_000, 5 * 60_000, 30 * 60_000];

/**
 * Ручной повтор (кнопка «Попробовать снова», /build?retry=1) снимает паузу один раз, но не раньше чем через минуту после
 * сбоя: опрос повтор не просит, а кнопкой слот рендера не занять подряд.
 */
const MANUAL_RETRY_MS = 60_000;

/** Код ошибки сборки для экрана; подробности (стек воркера с путями сервера) — только в лог. */
const RENDER_FAILED = "renderFailed";

/**
 * Версия экранной сборки в манифесте: другая — сборка в кэше не считается готовой и собирается заново вместе с картинками
 * и знаком. Менять, когда меняется то, чего нет в отпечатке: формат манифеста, разметка полос. Вёрстка блока входит
 * в отпечаток через LAYOUT_VERSION (render.tsx) — её правки только со сменой той версии: адреса картинок полос содержат
 * отпечаток, и браузер держит их навсегда.
 */
const BUILD_VERSION = 1;

/** Манифест в кэше: сборка без адреса картинок и версия сборки. */
type StoredManifest = BookBuildManifest & { v: number };

/** Уборка кэша — не чаще раза в сутки; картинки полос живут неделю без новых, сборки книги — месяц без пересборки. */
const SWEEP_EVERY_MS = 86_400_000;
const PAGES_TTL_MS = 7 * 86_400_000;
const BUILDS_TTL_MS = 30 * 86_400_000;
/** Временный файл недописанной записи (FileStore.put пишет через него): моложе часа — запись, может, ещё идёт. */
const TMP_MARK = ".tmp-";
const TMP_GRACE_MS = 3_600_000;

/** Экранная сборка и черновик, по которому её собрали (водяной знак — на языке этой книги). */
interface Screen {
  build: BookBuild;
  draft: ScreenDraft;
}

/** Последняя упавшая сборка книги: отпечаток, когда упала, сколько раз подряд; manual — пауза снята ручным повтором. */
interface Failure {
  fp: string;
  at: number;
  attempts: number;
  manual?: boolean;
}

/**
 * Файл кэша, который сейчас готовится: ждущие запросы с отменой (картинки полос) считаются — ушли все, и работа
 * отменяется; pinned — ждёт кто-то без отмены, доделываем в любом случае.
 */
interface Making {
  promise: Promise<Buffer>;
  ctrl: AbortController;
  waiters: number;
  pinned: boolean;
}

/**
 * Экранная сборка книги и всё, что из неё показывают автору: PDF-предпросмотр, картинки полос для 3D-книги и превью,
 * выгрузка текста. Пока книга не оплачена, скачиваемый PDF — со знаком «Предпросмотр» поверх (вёрстка под ним та же),
 * а картинки полос — чистые, но не крупнее UNPAID_MAX_WIDTH.
 * Сборка одна на отпечаток содержимого: cache/preview/<книга>/<отпечаток>.pdf и .json (манифест полос), рядом
 * <отпечаток>-wm.pdf со знаком; прошлая хранится, пока не записана новая, — пока идёт сборка, экран показывает прошлые
 * полосы. Картинки полос — cache/pages/<книга>/<отпечаток>/<n>-<ширина>.webp.
 */
/** Ширина картинки полосы до оплаты: экран и 3D — да, печать с картинок — нет (A5 ≈ 137 dpi). */
export const UNPAID_MAX_WIDTH = 800;

export class BookPreviewService {
  /** Последняя упавшая сборка книги. */
  private readonly failures = new Map<string, Failure>();
  /** Сборка книги, которая ждёт слот рендера: новые запросы присоединяются к ней. */
  private readonly waiting = new Map<string, Promise<Screen | null>>();
  /** Последняя заведённая сборка книги: следующая встаёт в очередь только после неё. */
  private readonly last = new Map<string, Promise<Screen | null>>();
  private seq = 0;
  /** Файлы кэша, которые сейчас готовятся: одинаковые запросы ждут один результат и не читают недописанный файл. */
  private readonly making = new Map<string, Making>();
  private sweptAt = -Infinity;

  constructor(
    private readonly renderer: BookRenderer,
    private readonly files: FileStore,
    private readonly queue: RenderQueue,
    private readonly raster: PageRaster,
    private readonly logger: Logger,
    /** Книга оплачена — водяной знак больше не нужен. */
    private readonly paid: (bookId: string) => Promise<boolean> = async () => false,
    private readonly clock: Clock = systemClock,
    /** Ход сборок: экран предпросмотра спрашивает его, пока страницы собираются. */
    private readonly progress: RenderProgress = new RenderProgress(),
  ) {}

  private dir(bookId: string) {
    return `cache/preview/${bookId}`;
  }
  private pdfKey(bookId: string, fp: string) {
    return `${this.dir(bookId)}/${fp}.pdf`;
  }
  private manifestKey(bookId: string, fp: string) {
    return `${this.dir(bookId)}/${fp}.json`;
  }
  private markedKey(bookId: string, fp: string) {
    return `${this.dir(bookId)}/${fp}-wm.pdf`;
  }
  private pagesDir(bookId: string, fp?: string) {
    return fp ? `cache/pages/${bookId}/${fp}` : `cache/pages/${bookId}`;
  }

  /** Готовая сборка из кэша: PDF и манифест этой версии на месте (манифест пишется последним — значит, PDF дописан). */
  private async cached(bookId: string, fp: string): Promise<BookBuild | null> {
    const key = this.manifestKey(bookId, fp);
    if (!(await this.files.exists(key)) || !(await this.files.exists(this.pdfKey(bookId, fp)))) return null;
    try {
      const m = JSON.parse((await this.files.get(key)).toString("utf8")) as Partial<StoredManifest>;
      if (m.v !== BUILD_VERSION || m.fp !== fp || !m.pages || m.pages.length !== m.pageCount || typeof m.contentPages !== "number" || !m.trimMm || !m.chapterPages) return null;
      return { fp, pageCount: m.pageCount, contentPages: m.contentPages, trimMm: m.trimMm, pages: m.pages, chapterPages: m.chapterPages, imageBase: buildImageBase(bookId, fp) };
    } catch {
      // Манифест испорчен — как будто сборки нет.
      return null;
    }
  }

  /** Самая свежая другая готовая сборка книги — её полосы показываем, пока идёт новая. */
  private async previous(bookId: string, fp: string): Promise<BookBuild | null> {
    const manifests = (await this.files.list(this.dir(bookId)))
      .filter((f) => f.name.endsWith(".json") && f.name !== `${fp}.json`)
      .sort((a, b) => b.modifiedMs - a.modifiedMs);
    for (const f of manifests) {
      const build = await this.cached(bookId, f.name.slice(0, -".json".length));
      if (build) return build;
    }
    return null;
  }

  /** Сборка с этим отпечатком недавно упала и ещё не пора повторять (ручной повтор паузу снял — пора). */
  private held(bookId: string, fp: string) {
    const f = this.failures.get(bookId);
    if (!f || f.fp !== fp || f.manual) return false;
    const hold = FAILED_HOLDS_MS[f.attempts - 1];
    return hold === undefined || this.clock.now().getTime() - f.at < hold;
  }

  /**
   * Экранная сборка текущего содержимого книги (или готовая); null — книги нет. На книгу ждёт очереди не больше одной
   * сборки: новые запросы присоединяются к ней, а что собирать, она решает, когда дойдёт очередь, — по книге в этот
   * момент. Автор правит, экран опрашивает — устаревшие отпечатки не верстаются впустую и не держат очередь, общую
   * с печатью оплаченных заказов. Следующая сборка книги встаёт в очередь после идущей: одну книгу не верстают дважды сразу.
   */
  private screen(bookId: string): Promise<Screen | null> {
    const waiting = this.waiting.get(bookId);
    if (waiting) return waiting;
    const after = this.last.get(bookId);
    const job = (async () => {
      // await всегда уступает ход: в очередь встаём, когда сборка уже записана в waiting, а идущая сборка книги закончилась.
      await after?.catch(() => undefined);
      const key = `screen:${bookId}:${++this.seq}`;
      this.progress.queued(key, "screen");
      return this.queue.run(key, () =>
        this.progress.track(key, (report) => {
          // Пошла — дальнейшие запросы заводят следующую сборку.
          this.waiting.delete(bookId);
          return this.assemble(bookId, report);
        }),
      );
    })();
    this.waiting.set(bookId, job);
    this.last.set(bookId, job);
    const done = () => {
      if (this.waiting.get(bookId) === job) this.waiting.delete(bookId);
      if (this.last.get(bookId) === job) this.last.delete(bookId);
    };
    job.then(done, done);
    return job;
  }

  /** Сборка в слоте рендера: книга как сейчас, готовая — из кэша. Пока книга не оплачена, сразу ставит и знак. */
  private async assemble(bookId: string, report?: RenderReport): Promise<Screen | null> {
    const draft = await this.renderer.preview(bookId);
    if (!draft) return null;
    const fp = draft.fingerprint;
    const ready = await this.cached(bookId, fp);
    if (ready) return { build: ready, draft };
    if (this.held(bookId, fp)) throw new Error(`screen build ${bookId}:${fp} failed recently`);
    let build: BookBuild;
    try {
      const { pdf, manifest } = await draft.render(report);
      report?.({ stage: "finish" });
      // Тот же отпечаток собирается заново (манифест испорчен, другая версия сборки) — картинки и знак прошлого PDF не годятся.
      await this.files.deletePrefix(this.pagesDir(bookId, fp));
      await this.files.deletePrefix(this.markedKey(bookId, fp));
      await this.files.put(this.pdfKey(bookId, fp), pdf);
      // Знак — до манифеста: пока манифеста нет, картинки полос не запрашивают знак отдельно (и не ждут слот, занятый этой сборкой).
      await this.markEagerly(bookId, fp, draft, pdf);
      const stored: StoredManifest = { ...manifest, fp, v: BUILD_VERSION };
      await this.files.put(this.manifestKey(bookId, fp), Buffer.from(JSON.stringify(stored)));
      build = { ...manifest, fp, imageBase: buildImageBase(bookId, fp) };
    } catch (err) {
      const prev = this.failures.get(bookId);
      const attempts = prev?.fp === fp ? prev.attempts + 1 : 1;
      this.failures.set(bookId, { fp, at: this.clock.now().getTime(), attempts });
      this.logger.error(`screen build failed for book ${bookId} (${fp}, attempt ${attempts})`, err);
      throw err;
    }
    if (this.failures.get(bookId)?.fp === fp) this.failures.delete(bookId);
    // Уборка — не часть сборки: её сбой не делает готовую сборку упавшей.
    await this.prune(bookId, fp).catch((err) => this.logger.warn(`preview cache prune failed for book ${bookId}`, { error: String(err) }));
    return { build, draft };
  }

  /** Знак для неоплаченной книги сразу после сборки, в том же слоте; не вышло — его сделают по запросу. */
  private async markEagerly(bookId: string, fp: string, draft: ScreenDraft, pdf: Buffer) {
    try {
      if (await this.paid(bookId)) return;
      await this.files.put(this.markedKey(bookId, fp), await draft.watermark(pdf));
    } catch (err) {
      this.logger.warn(`preview watermark failed for book ${bookId}`, { error: String(err) });
    }
  }

  /**
   * Новая сборка записана — прошлые больше не нужны: удаляем их PDF, манифесты и картинки полос. Если книгу успели
   * поменять, пока шла сборка, — ничего не трогаем: свежую сборку мог уже записать другой рендер. Книгу удалили —
   * удаляем всё, что успели записать.
   */
  private async prune(bookId: string, fp: string) {
    const current = await this.renderer.preview(bookId);
    if (!current) {
      await this.files.deletePrefix(this.dir(bookId));
      await this.files.deletePrefix(this.pagesDir(bookId));
      return;
    }
    if (current.fingerprint !== fp) return;
    const now = this.clock.now().getTime();
    const keep = new Set([`${fp}.pdf`, `${fp}.json`, `${fp}-wm.pdf`]);
    for (const f of await this.files.list(this.dir(bookId))) {
      if (keep.has(f.name) || (f.name.includes(TMP_MARK) && now - f.modifiedMs < TMP_GRACE_MS)) continue;
      await this.files.deletePrefix(`${this.dir(bookId)}/${f.name}`);
    }
    for (const f of await this.files.list(this.pagesDir(bookId))) if (f.name !== fp) await this.files.deletePrefix(this.pagesDir(bookId, f.name));
  }

  /**
   * Файл кэша: готовый — из хранилища, нет — make() один раз на все одновременные запросы. С signal запрос может уйти
   * (листали дальше, закрыли вкладку): ушли все ждущие — make отменяется (растр снимается с очереди или прерывается),
   * а следующий запрос того же файла начинает заново, а не присоединяется к отменённому.
   */
  private once(key: string, make: (signal: AbortSignal) => Promise<Buffer>, signal?: AbortSignal): Promise<Buffer> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    let job = this.making.get(key);
    if (!job) {
      const entry: Making = { promise: Promise.resolve(Buffer.alloc(0)), ctrl: new AbortController(), waiters: 0, pinned: false };
      entry.promise = (async () => {
        if (await this.files.exists(key)) return this.files.get(key);
        const data = await make(entry.ctrl.signal);
        await this.files.put(key, data);
        return data;
      })().finally(() => {
        if (this.making.get(key) === entry) this.making.delete(key);
      });
      this.making.set(key, entry);
      job = entry;
    }
    const entry = job;
    if (!signal) {
      entry.pinned = true;
      return entry.promise;
    }
    entry.waiters++;
    return new Promise<Buffer>((resolve, reject) => {
      const leave = () => {
        entry.waiters--;
        reject(signal.reason);
        if (entry.waiters > 0 || entry.pinned) return;
        if (this.making.get(key) === entry) this.making.delete(key);
        entry.ctrl.abort(signal.reason);
      };
      signal.addEventListener("abort", leave, { once: true });
      const settle = (done: () => void) => {
        if (signal.aborted) return;
        signal.removeEventListener("abort", leave);
        entry.waiters--;
        done();
      };
      entry.promise.then(
        (data) => settle(() => resolve(data)),
        (err: unknown) => settle(() => reject(err)),
      );
    });
  }

  /**
   * PDF сборки fp со знаком (кэш <fp>-wm.pdf). Обычно его ставит сама сборка; здесь — запасной путь, тоже в очереди
   * рендера: pdf-lib разбирает весь файл, и рядом с вёрсткой другой книги это вывело бы процесс за лимит памяти.
   */
  private marked(bookId: string, fp: string, draft: ScreenDraft | null): Promise<Buffer> {
    const key = this.markedKey(bookId, fp);
    return this.once(key, () =>
      this.queue.run(key, async () => {
        const d = draft ?? (await this.renderer.preview(bookId));
        if (!d) throw new Error(`book ${bookId} not found`);
        return d.watermark(await this.files.get(this.pdfKey(bookId, fp)));
      }),
    );
  }

  /**
   * Состояние экранной сборки для экрана; null — книги нет. Не ждёт рендера: нет готовой — запускает сборку в фоне
   * и отвечает «собирается» с прошлой готовой. Упавшая сборка отвечает «ошибка» и не перезапускается, пока не пройдёт
   * пауза FAILED_HOLDS_MS; retry (кнопка «Попробовать снова») снимает паузу один раз, если со сбоя прошло MANUAL_RETRY_MS,
   * — иначе в ответе, через сколько кнопка сработает.
   */
  async build(bookId: string, opts: { retry?: boolean } = {}): Promise<BookBuildState | null> {
    const draft = await this.renderer.preview(bookId);
    if (!draft) return null;
    const fp = draft.fingerprint;
    const ready = await this.cached(bookId, fp);
    if (ready) return { status: "ready", build: ready };
    const previous = await this.previous(bookId, fp);
    const failure = this.failures.get(bookId);
    if (failure && this.held(bookId, fp)) {
      const wait = failure.at + MANUAL_RETRY_MS - this.clock.now().getTime();
      if (!opts.retry || wait > 0) return { status: "failed", previous, error: RENDER_FAILED, retryInMs: Math.max(0, wait) };
      // Следующий сбой запишется заново, без пометки, — и снова будет держать паузу.
      this.failures.set(bookId, { ...failure, manual: true });
    }
    // Сбой пишется в лог и в failures при сборке; здесь его не ждём.
    this.screen(bookId).catch(() => undefined);
    return { status: "building", previous };
  }

  /** Ход идущей сборки книги для экрана; null — сборки нет (готова, не начата или упала). Книгу не загружает: читает только память. */
  progressOf(bookId: string): BuildProgress | null {
    return this.progress.forBook(bookId);
  }

  /**
   * Готовая сборка текущего содержимого книги — для точного числа страниц там, где книгу не листают (хаб, оформление
   * заказа, карточка заказа). Ничего не собирает: нет готовой (книгу поправили, макет не открывали) — null, и там
   * остаётся оценка.
   */
  async current(bookId: string): Promise<BookBuild | null> {
    const draft = await this.renderer.preview(bookId);
    return draft ? this.cached(bookId, draft.fingerprint) : null;
  }

  /**
   * Картинка полосы n сборки fp (WebP шириной width) — растр настоящего PDF, обрезанный по формату. На экране страницы
   * всегда без знака (знак — только в скачиваемом PDF), но пока книга не оплачена, картинка не шире UNPAID_MAX_WIDTH:
   * для экрана и 3D хватает, для печати — нет (limited: такую браузер должен перепроверять — после оплаты по тому же
   * адресу придёт крупнее).
   * null — такой сборки или полосы нет (книгу поменяли и прошлую сборку удалили — экран возьмёт новую из build()).
   * signal — запрос браузера: ушёл (полосу пролистали) — растр, который больше никто не ждёт, не делается.
   */
  async pageImage(bookId: string, fp: string, n: number, requested: PageImageWidth, signal?: AbortSignal): Promise<{ data: Buffer; limited: boolean } | null> {
    const build = await this.cached(bookId, fp);
    const page = build?.pages[n - 1];
    if (!build || !page) return null;
    const dir = this.pagesDir(bookId, fp);
    const limited = requested > UNPAID_MAX_WIDTH && !(await this.paid(bookId));
    const width = limited ? UNPAID_MAX_WIDTH : requested;
    if (page.kind === "pad") return { data: await this.once(`${dir}/${n}-${width}.webp`, () => this.raster.blank(width, build.trimMm), signal), limited };
    const source = this.pdfKey(bookId, fp);
    try {
      const data = await this.once(`${dir}/${n}-${width}.webp`, (job) => this.raster.page(source, n, width, build.trimMm, job), signal);
      return { data, limited };
    } catch (err) {
      // Запрос ушёл — отвечать некому.
      if (signal?.aborted) throw err;
      // Сборку удалила новая, пока растрировали.
      if (!RasterizerMissingError.is(err) && !(await this.files.exists(this.pdfKey(bookId, fp)))) return null;
      throw err;
    }
  }

  /** PDF-предпросмотр для скачивания: экранная сборка, пока книга не оплачена — со знаком поверх (кэш <fp>-wm.pdf). */
  async preview(bookId: string): Promise<Buffer | null> {
    const draft = await this.renderer.preview(bookId);
    if (!draft) return null;
    let screen: Screen | null = null;
    const ready = await this.cached(bookId, draft.fingerprint);
    if (ready) screen = { build: ready, draft };
    else if (this.held(bookId, draft.fingerprint)) throw new Error(`screen build ${bookId}:${draft.fingerprint} failed recently`);
    // Книгу могли поменять, пока ждали очередь: отдаём сборку того, что в ней сейчас.
    else screen = await this.screen(bookId);
    if (!screen) return null;
    const { fp } = screen.build;
    if (await this.paid(bookId)) return this.files.get(this.pdfKey(bookId, fp));
    return this.marked(bookId, fp, screen.draft);
  }

  /**
   * Уборка кэша (из фонового прохода, не чаще раза в сутки): картинки полос сборки без новых больше недели и сборки
   * книг, которые месяц не пересобирались, — всё это собирается заново по запросу. Сколько папок удалено.
   */
  async sweep(): Promise<number> {
    const now = this.clock.now().getTime();
    if (now - this.sweptAt < SWEEP_EVERY_MS) return 0;
    this.sweptAt = now;
    let removed = 0;
    for (const book of await this.files.list("cache/pages"))
      for (const f of await this.files.list(this.pagesDir(book.name)))
        if (now - f.modifiedMs > PAGES_TTL_MS) {
          await this.files.deletePrefix(this.pagesDir(book.name, f.name));
          removed++;
        }
    for (const book of await this.files.list("cache/preview"))
      if (now - book.modifiedMs > BUILDS_TTL_MS) {
        await this.files.deletePrefix(this.dir(book.name));
        removed++;
      }
    return removed;
  }

  manuscript(bookId: string) {
    return this.renderer.manuscript(bookId);
  }
}
