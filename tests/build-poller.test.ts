import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BuildPoller } from "@/components/book-pages/build-poller";
import { buildImageBase, type BookBuild, type BookBuildState } from "@/lib/book/book-build";

// Опрос экранной сборки: растущая пауза, «долго» после 5 минут, тишина на «готово»/«ошибка» и в скрытой вкладке,
// возвращение во вкладку без двойных запросов, ответ на отменённый запрос не затирает свежий, кнопка повтора оживает сама.

const build = (fp: string): BookBuild => ({ fp, pageCount: 4, contentPages: 3, trimMm: { w: 148, h: 210 }, pages: [], chapterPages: {}, imageBase: buildImageBase("b1", fp) });
const building: BookBuildState = { status: "building", previous: null };
const ready = (fp = "0123456789abcdef"): BookBuildState => ({ status: "ready", build: build(fp) });

/** Сервер: отвечает тем, что положили в answers (последний — дальше всегда), и помнит, когда и с повтором ли спрашивали. */
function setup(answers: (BookBuildState | Error)[] = [building]) {
  const calls: { at: number; retry: boolean }[] = [];
  const start = Date.now();
  let visible = true;
  const poller = new BuildPoller({
    fetch: async (retry) => {
      calls.push({ at: Date.now() - start, retry });
      const next = answers.length > 1 ? answers.shift()! : answers[0];
      if (next instanceof Error) throw next;
      return next;
    },
    now: () => Date.now(),
    visible: () => visible,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  });
  return {
    poller,
    calls,
    answers,
    times: () => calls.map((c) => c.at),
    hide: () => void (visible = false),
    show: () => void (visible = true),
  };
}

beforeEach(() => {
  vi.useFakeTimers({ now: Date.parse("2026-10-22T10:00:00Z") });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("опрос сборки", () => {
  it("пока собирается — пауза растёт: 2, 3, 5, потом раз в 10 с", async () => {
    const t = setup();
    t.poller.start();
    await vi.advanceTimersByTimeAsync(40_000);
    expect(t.times()).toEqual([0, 2_000, 5_000, 10_000, 20_000, 30_000, 40_000]);
    t.poller.stop();
  });

  it("на «готово» и «ошибка» замолкает", async () => {
    for (const end of [ready(), { status: "failed", previous: null, error: "renderFailed" } as const]) {
      const t = setup([building, building, end]);
      t.poller.start();
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(t.times()).toEqual([0, 2_000, 5_000]);
      expect(t.poller.snapshot().state).toEqual(end);
      t.poller.stop();
    }
  });

  it("сборка дольше 5 минут — «долго» и раз в 30 с; готова — «долго» снимается", async () => {
    const t = setup();
    t.poller.start();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(t.poller.snapshot().slow).toBe(true);
    const before = t.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.calls.length - before).toBe(2);
    t.answers.splice(0, t.answers.length, ready());
    await vi.advanceTimersByTimeAsync(30_000);
    expect(t.poller.snapshot()).toMatchObject({ slow: false, state: { status: "ready" } });
    t.poller.stop();
  });

  it("запрос не прошёл во время сборки — текст ошибки, прошлое состояние остаётся, следующий не раньше 5 с", async () => {
    const t = setup([building, new Error("Нет связи"), building]);
    t.poller.start();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(t.poller.snapshot()).toMatchObject({ state: building, error: "Нет связи" });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(t.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.calls).toHaveLength(3);
    expect(t.poller.snapshot().error).toBeNull();
    t.poller.stop();
  });

  it("скрытая вкладка не опрашивает; вернулись — сразу спрашиваем, и пауза снова с 2 с", async () => {
    const t = setup();
    t.poller.start();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(t.times()).toEqual([0, 2_000, 5_000, 10_000, 20_000]);
    t.hide();
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(t.calls).toHaveLength(5);
    t.show();
    t.poller.wake();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(t.times().slice(5)).toEqual([140_000, 142_000]);
    t.poller.stop();
  });

  it("focus и visibilitychange вместе — один запрос; свежий ответ (моложе 3 с) не переспрашиваем", async () => {
    const t = setup([ready()]);
    t.poller.start();
    // первый запрос ещё идёт — возвращение его не дублирует
    t.poller.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.calls).toHaveLength(1);
    t.poller.wake();
    t.poller.wake();
    await vi.advanceTimersByTimeAsync(2_999);
    expect(t.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60_000);
    t.poller.wake();
    t.poller.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.calls).toHaveLength(2);
    t.poller.stop();
  });

  it("ответ на отменённый запрос не затирает свежий", async () => {
    const answers: ((s: BookBuildState) => void)[] = [];
    const poller = new BuildPoller({
      fetch: (_retry, signal) =>
        new Promise<BookBuildState>((resolve, reject) => {
          answers.push(resolve);
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
      now: () => Date.now(),
      visible: () => true,
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    });
    poller.start();
    const second = poller.retry();
    answers[1](ready("fedcba9876543210"));
    await second;
    answers[0](ready("0123456789abcdef"));
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.snapshot()).toMatchObject({ error: null, state: { build: { fp: "fedcba9876543210" } } });
    poller.stop();
  });

  it("остановлен — ни запросов, ни ответов", async () => {
    const t = setup();
    t.poller.start();
    t.poller.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.calls).toHaveLength(1);
    expect(t.poller.snapshot().state).toBeNull();
  });
});

describe("сборка не удалась", () => {
  it("кнопка повтора спрашивает с retry; «через сколько» с сервера — время по часам браузера, потом кнопка оживает сама", async () => {
    const t = setup([{ status: "failed", previous: null, error: "renderFailed", retryInMs: 40_000 }, building]);
    const seen: (number | null)[] = [];
    t.poller.subscribe(() => seen.push(t.poller.snapshot().retryAt));
    t.poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.poller.snapshot().retryAt).toBe(Date.now() + 40_000);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(t.poller.snapshot().retryAt).toBeNull();
    expect(t.calls).toEqual([{ at: 0, retry: false }]);
    await t.poller.retry();
    expect(t.calls[1]).toEqual({ at: 40_000, retry: true });
    expect(t.poller.snapshot()).toMatchObject({ state: building, retryAt: null });
    // и опрос пошёл заново
    await vi.advanceTimersByTimeAsync(2_000);
    expect(t.calls).toHaveLength(3);
    expect(seen).toContain(null);
    t.poller.stop();
  });
});

describe("картинка полосы не загрузилась", () => {
  it("сборку переспрашиваем не чаще раза в 5 с, сколько бы полос ни упало", async () => {
    const t = setup([ready()]);
    t.poller.start();
    await vi.advanceTimersByTimeAsync(10_000);
    for (let i = 0; i < 10; i++) t.poller.recover();
    await vi.advanceTimersByTimeAsync(4_000);
    for (let i = 0; i < 10; i++) t.poller.recover();
    await vi.advanceTimersByTimeAsync(1_000);
    t.poller.recover();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.times()).toEqual([0, 10_000, 15_000]);
    t.poller.stop();
  });
});
