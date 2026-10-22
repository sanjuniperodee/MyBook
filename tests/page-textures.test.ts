import { describe, expect, it, vi } from "vitest";
import { PageTextures, type PageFailure, type PageJob } from "@/components/book3d/webgl/page-textures";

// Картинки полос 3D-книги: только окно у разворота, не больше трёх загрузок сразу, ушедшее из окна отменяется
// и отпускается (память iPhone), новая сборка сменяет старую картинку без белой вспышки.

/** Обработчики промисов загрузки отработали. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class Img {
  closed = false;
  constructor(readonly url: string) {}
  close() {
    this.closed = true;
  }
}

/** Загрузки под контролем теста: каждую можно завершить или уронить, отмену видно по сигналу. */
function harness(limit?: number, retryMs: readonly number[] = [5, 15]) {
  const pending = new Map<string, { resolve: (img: Img) => void; reject: (e: unknown) => void; signal: AbortSignal }>();
  const applied: [string, string | null][] = [];
  const images: Img[] = [];
  const failures: PageFailure<string>[] = [];
  const textures = new PageTextures<string, Img>(
    (key, img) => applied.push([key, img?.url ?? null]),
    (url, signal) =>
      new Promise<Img>((resolve, reject) => {
        pending.set(url, { resolve, reject, signal });
      }),
    limit,
    (f) => failures.push(f),
    retryMs,
  );
  const finish = async (url: string) => {
    const img = new Img(url);
    images.push(img);
    pending.get(url)!.resolve(img);
    pending.delete(url);
    await flush();
    return img;
  };
  const fail = async (url: string) => {
    pending.get(url)!.reject(new Error("503"));
    pending.delete(url);
    await flush();
  };
  const loading = () => [...pending.entries()].filter(([, p]) => !p.signal.aborted).map(([url]) => url);
  return { textures, pending, applied, images, failures, finish, fail, loading };
}

const job = (key: string, id: string, url: string | null = `/p/${id}`): PageJob => ({ key, id, url });

describe("PageTextures", () => {
  it("грузит по важности и не больше трёх сразу; освободилось место — следующая из очереди", async () => {
    const h = harness();
    h.textures.want([job("a", "1"), job("b", "2"), job("c", "3"), job("d", "4"), job("e", "5")]);
    expect(h.loading()).toEqual(["/p/1", "/p/2", "/p/3"]);
    await h.finish("/p/2");
    expect(h.applied).toEqual([["b", "/p/2"]]);
    expect(h.loading()).toEqual(["/p/1", "/p/3", "/p/4"]);
  });

  it("ушло из окна — загрузка отменяется, а пришедшая всё же картинка закрывается и на лист не попадает", async () => {
    const h = harness();
    h.textures.want([job("a", "1"), job("b", "2")]);
    const slow = h.pending.get("/p/2")!;
    h.textures.want([job("a", "1")]);
    expect(slow.signal.aborted).toBe(true);
    const late = await h.finish("/p/2");
    expect(late.closed).toBe(true);
    expect(h.applied).toEqual([]);
  });

  it("лист вне окна отпускает картинку; пустая полоса добивки — без картинки и без загрузки", async () => {
    const h = harness();
    h.textures.want([job("a", "1"), job("b", "2")]);
    await h.finish("/p/1");
    await h.finish("/p/2");
    h.textures.want([job("b", "2"), job("c", "3", null)]);
    expect(h.applied.slice(2)).toEqual([["a", null]]);
    expect(h.loading()).toEqual([]);
  });

  it("новая сборка: старая картинка стоит, пока не пришла новая; та же сборка второй раз не грузится", async () => {
    const h = harness();
    h.textures.want([job("a", "old:1")]);
    await h.finish("/p/old:1");
    h.textures.want([job("a", "old:1")]);
    expect(h.loading()).toEqual([]);
    h.textures.want([job("a", "new:1")]);
    expect(h.applied).toEqual([["a", "/p/old:1"]]);
    await h.finish("/p/new:1");
    expect(h.applied).toEqual([
      ["a", "/p/old:1"],
      ["a", "/p/new:1"],
    ]);
  });

  it("сбой полосы — ещё две попытки с паузой, потом тишина, пока она в окне; ушла и вернулась — пробуем снова", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const h = harness();
    h.textures.want([job("a", "1")]);
    await h.fail("/p/1");
    // сразу не повторяем — после паузы
    h.textures.want([job("a", "1")]);
    expect(h.loading()).toEqual([]);
    await sleep(10);
    expect(h.loading()).toEqual(["/p/1"]);
    await h.fail("/p/1");
    await sleep(25);
    expect(h.loading()).toEqual(["/p/1"]);
    await h.fail("/p/1");
    await sleep(25);
    expect(h.loading()).toEqual([]);
    expect(h.failures).toEqual([
      { key: "a", id: "1", final: false },
      { key: "a", id: "1", final: false },
      { key: "a", id: "1", final: true },
    ]);
    h.textures.want([]);
    h.textures.want([job("a", "1")]);
    expect(h.loading()).toEqual(["/p/1"]);
    warn.mockRestore();
  });

  it("новая сборка не загрузилась — полоса прошлой снимается с листа (чистый лист, не чужая версия), повтор — сам", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const h = harness();
    h.textures.want([job("a", "old:1"), job("b", "old:2")]);
    await h.finish("/p/old:1");
    await h.finish("/p/old:2");
    h.textures.want([job("a", "new:1"), job("b", "new:2")]);
    await h.fail("/p/new:1");
    expect(h.applied.slice(2)).toEqual([["a", null]]);
    await h.finish("/p/new:2");
    expect(h.applied.slice(3)).toEqual([["b", "/p/new:2"]]);
    await sleep(10);
    await h.finish("/p/new:1");
    expect(h.applied.slice(4)).toEqual([["a", "/p/new:1"]]);
    warn.mockRestore();
  });

  it("«Попробовать снова» после всех попыток — окно грузится заново", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const h = harness(3, []);
    h.textures.want([job("a", "1")]);
    await h.fail("/p/1");
    expect(h.failures).toEqual([{ key: "a", id: "1", final: true }]);
    h.textures.want([job("a", "1")]);
    expect(h.loading()).toEqual([]);
    h.textures.retryFailed();
    expect(h.loading()).toEqual(["/p/1"]);
    warn.mockRestore();
  });

  it("закрыта сцена во время паузы перед повтором — повтора нет", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const h = harness();
    h.textures.want([job("a", "1")]);
    await h.fail("/p/1");
    h.textures.dispose();
    await sleep(10);
    expect(h.loading()).toEqual([]);
    warn.mockRestore();
  });

  it("закрыта сцена — все загрузки отменены, пришедшие картинки закрываются", async () => {
    const h = harness();
    h.textures.want([job("a", "1"), job("b", "2")]);
    const signals = [...h.pending.values()].map((p) => p.signal);
    h.textures.dispose();
    expect(signals.every((s) => s.aborted)).toBe(true);
    expect((await h.finish("/p/1")).closed).toBe(true);
    expect(h.applied).toEqual([]);
  });

  it("контекст WebGL восстановлен — окно грузится заново", async () => {
    const h = harness();
    h.textures.want([job("a", "1")]);
    await h.finish("/p/1");
    h.textures.reset();
    expect(h.loading()).toEqual(["/p/1"]);
  });
});
