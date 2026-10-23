import type { BookBuildState } from "@/lib/book/book-build";

/**
 * Пока сборка идёт — спрашиваем всё реже: 2, 3, 5, потом раз в 10 с (большая книга верстается минутами, а каждый
 * вопрос — загрузка книги и отпечаток на сервере). Вернулись во вкладку — снова с 2 с.
 */
const POLL_MS = [2_000, 3_000, 5_000, 10_000];
/** Запрос не прошёл (сеть, сервер) — не чаще. */
const POLL_AFTER_ERROR_MS = 5_000;
/** Сборка идёт дольше SLOW_AFTER_MS — спрашиваем раз в полминуты, на экране — что так бывает. */
const SLOW_AFTER_MS = 5 * 60_000;
const POLL_SLOW_MS = 30_000;
/** Возвращение во вкладку приносит и focus, и visibilitychange: свежий ответ (моложе FRESH_MS) не переспрашиваем. */
const FRESH_MS = 3_000;
/** Картинка полосы не загрузилась — сборку переспрашиваем не чаще раза в RECOVER_MS, сколько бы полос ни упало. */
const RECOVER_MS = 5_000;

export interface BuildPollerView {
  /** Последний ответ /api/books/[id]/build; null — первый ещё не пришёл. */
  state: BookBuildState | null;
  /** Последний запрос не прошёл — текст на языке страницы; null — прошёл. */
  error: string | null;
  /** Сборка идёт дольше обычного: опрос реже, на экране — подсказка. */
  slow: boolean;
  /** Когда (по часам браузера) сработает ручной повтор упавшей сборки; null — уже (или сборка не упала). */
  retryAt: number | null;
}

/** Всё, что опросу нужно от браузера: в тестах — заглушки и поддельные таймеры. */
export interface BuildPollerEnv {
  fetch(retry: boolean, signal: AbortSignal): Promise<BookBuildState>;
  now(): number;
  /** Вкладка видна: скрытая не опрашивает. */
  visible(): boolean;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

const INITIAL: BuildPollerView = { state: null, error: null, slow: false, retryAt: null };

/**
 * Опрос экранной сборки (BookBuildState) без React: пока «собирается» — спрашивает с растущей паузой, на «готово»
 * и «ошибка» — замолкает. Побеждает последний запрос: ответ на отменённый — уже про прошлую версию книги.
 */
export class BuildPoller {
  private view: BuildPollerView = INITIAL;
  private readonly listeners = new Set<() => void>();
  private running: AbortController | null = null;
  private timer: unknown = null;
  private retryTimer: unknown = null;
  /** Опросов подряд, пока сборка идёт: по ним пауза. */
  private polls = 0;
  private buildingSince: number | null = null;
  private answeredAt = -Infinity;
  private recoveredAt = -Infinity;
  private stopped = true;

  constructor(private readonly env: BuildPollerEnv) {}

  readonly snapshot = () => this.view;

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  start() {
    this.stopped = false;
    void this.ask(false);
  }

  stop() {
    this.stopped = true;
    this.running?.abort();
    this.running = null;
    this.env.clearTimeout(this.timer);
    this.env.clearTimeout(this.retryTimer);
    this.timer = this.retryTimer = null;
  }

  /** Кнопка «Попробовать снова»: после сбоя сборки сервер снимает паузу (если уже можно), иначе просто спрашиваем. */
  retry(): Promise<void> {
    this.polls = 0;
    return this.ask(true);
  }

  /** Вернулись во вкладку: книгу могли поправить в редакторе — спрашиваем, если не спрашиваем уже и ответ не свежий. */
  wake() {
    if (this.stopped || !this.env.visible()) return;
    this.polls = 0;
    if (this.running || this.env.now() - this.answeredAt < FRESH_MS) return;
    void this.ask(false);
  }

  /** Картинка полосы не загрузилась: сборку могли заменить (и прошлую удалить) — переспрашиваем, но не чаще RECOVER_MS. */
  recover() {
    const now = this.env.now();
    if (this.stopped || this.running || now - this.recoveredAt < RECOVER_MS) return;
    this.recoveredAt = now;
    void this.ask(false);
  }

  private set(view: BuildPollerView) {
    this.view = view;
    for (const l of this.listeners) l();
  }

  private async ask(retry: boolean) {
    this.running?.abort();
    this.env.clearTimeout(this.timer);
    this.timer = null;
    const ctrl = new AbortController();
    this.running = ctrl;
    try {
      const next = await this.env.fetch(retry, ctrl.signal);
      if (ctrl.signal.aborted) return;
      const now = this.env.now();
      if (next.status === "building") this.buildingSince ??= now;
      else {
        this.buildingSince = null;
        this.polls = 0;
      }
      const slow = this.buildingSince !== null && now - this.buildingSince >= SLOW_AFTER_MS;
      this.set({ state: next, error: null, slow, retryAt: next.status === "failed" && next.retryInMs ? now + next.retryInMs : null });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      this.set({ ...this.view, error: err instanceof Error ? err.message : String(err) });
    } finally {
      if (this.running === ctrl) this.running = null;
    }
    this.answeredAt = this.env.now();
    this.schedule();
  }

  private schedule() {
    if (this.stopped) return;
    const { state, error, slow, retryAt } = this.view;
    this.env.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    // Ручной повтор станет доступен — кнопка оживает сама, без запроса.
    if (retryAt !== null)
      this.retryTimer = this.env.setTimeout(
        () => {
          this.retryTimer = null;
          if (this.view.retryAt === retryAt) this.set({ ...this.view, retryAt: null });
        },
        Math.max(0, retryAt - this.env.now()),
      );
    if (state?.status !== "building") return;
    const delay = slow ? POLL_SLOW_MS : Math.max(error ? POLL_AFTER_ERROR_MS : 0, POLL_MS[Math.min(this.polls, POLL_MS.length - 1)]);
    this.timer = this.env.setTimeout(() => {
      this.timer = null;
      // Скрытая вкладка не опрашивает: вернётся — спросит сразу (wake).
      if (!this.env.visible()) return;
      this.polls++;
      void this.ask(false);
    }, delay);
  }
}
