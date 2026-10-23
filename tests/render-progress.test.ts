import { describe, expect, it, vi } from "vitest";
import { RenderProgress, type RenderReport } from "@/modules/production";
import { formatEta, progressSummary } from "@/components/ui/RenderProgress";
import { orders as ru } from "@/i18n/messages/ru/orders";
import { orders as kk } from "@/i18n/messages/kk/orders";
import { job, setup } from "./doubles/production";

/** Сборка пакета: этапы и сколько мс каждый «длится» по часам теста. */
function runPackage(t: ReturnType<typeof setup>, key: string, steps: [stage: Parameters<RenderReport>[0]["stage"], ms: number, size?: number][]) {
  return t.progress.track(key, async (report) => {
    for (const [stage, ms, size] of steps) {
      report({ stage, size });
      t.clock.ms += ms;
    }
  });
}

describe("RenderProgress: ход сборки PDF", () => {
  it("сборка в очереди: проценты нулевые, срока нет, перед ней — сколько сборок стоит раньше", () => {
    const t = setup();
    t.progress.queued("print:o1", "package");
    t.clock.ms += 1500;
    t.progress.queued("reading:o2", "reading");
    expect(t.progress.snapshot("print:o1")).toMatchObject({ kind: "package", state: "queued", stage: null, percent: 0, etaMs: null, ahead: 0, elapsedMs: 1500 });
    expect(t.progress.snapshot("reading:o2")).toMatchObject({ state: "queued", ahead: 1 });
    // Повторный вызов склеенного запроса не сбрасывает ожидание.
    t.progress.queued("print:o1", "package");
    expect(t.progress.snapshot("print:o1")?.elapsedMs).toBe(1500);
  });

  it("идёт по этапам: процент растёт, срок убывает, до 100 % не доходит, пока файл не готов", async () => {
    const t = setup();
    t.progress.queued("print:o1", "package");
    const seen: ReturnType<RenderProgress["snapshot"]>[] = [];
    await t.progress.track("print:o1", async (report) => {
      seen.push(t.progress.snapshot("print:o1"));
      report({ stage: "images", size: 50 });
      seen.push(t.progress.snapshot("print:o1"));
      t.clock.ms += 50;
      seen.push(t.progress.snapshot("print:o1"));
      report({ stage: "flow" });
      t.clock.ms += 600;
      seen.push(t.progress.snapshot("print:o1"));
      report({ stage: "final" });
      report({ stage: "cover" });
      t.clock.ms += 10_000;
      seen.push(t.progress.snapshot("print:o1"));
    });
    // Начальные оценки (сид): картинки 100, вёрстка 1250, сборка 200, обложка 250, файлы 50 мс при размере 50.
    expect(seen[1]).toMatchObject({ state: "running", stage: "images", percent: 0, etaMs: 1850, overrun: false });
    expect(seen[2]).toMatchObject({ stage: "images", percent: 2, etaMs: 1800 });
    expect(seen[3]).toMatchObject({ stage: "flow", overrun: false });
    expect(seen[3]!.percent).toBeGreaterThan(seen[2]!.percent);
    expect(seen[3]!.etaMs).toBeLessThan(seen[2]!.etaMs!);
    // Обложка тянется дольше оценки: полоса упирается в потолок этапа, срока нет, но и 100 % нет.
    expect(seen[4]).toMatchObject({ stage: "cover", overrun: true });
    expect(seen[4]!.percent).toBeLessThan(100);
    expect(seen[4]!.etaMs).toBe(50);
    const percents = seen.slice(1).map((s) => s!.percent);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
    // Сборка закончилась — записи нет.
    expect(t.progress.snapshot("print:o1")).toBeNull();
  });

  it("этапы идут только вперёд: повтор этапа (проход вёрстки) и возврат срок не сбрасывают", async () => {
    const t = setup();
    t.progress.queued("print:o1", "package");
    await t.progress.track("print:o1", async (report) => {
      report({ stage: "images", size: 50 });
      report({ stage: "flow" });
      t.clock.ms += 400;
      const before = t.progress.snapshot("print:o1")!;
      report({ stage: "flow" });
      report({ stage: "images" });
      expect(t.progress.snapshot("print:o1")).toEqual(before);
    });
  });

  it("удачные сборки уточняют срок и сохраняются: следующая сборка (и после перезапуска) оценивается по ним", async () => {
    const t = setup();
    t.progress.queued("print:o1", "package");
    await runPackage(t, "print:o1", [["images", 1000, 50], ["flow", 5000], ["final", 2000], ["cover", 500], ["finish", 100]]);
    expect(t.files.keys()).toContain("cache/render-rates.json");

    const eta = async (progress: RenderProgress) => {
      progress.queued("print:o2", "package");
      let value: number | null = null;
      await progress.track("print:o2", async (report) => {
        report({ stage: "images", size: 50 });
        value = progress.snapshot("print:o2")!.etaMs;
      });
      return value;
    };
    // Скользящее среднее: 0,6 · сид + 0,4 · замер, по каждому этапу (картинки 9,2·50, вёрстка 1,1·50², сборка 18,4·50, обложка 350, файлы 52).
    expect(await eta(t.progress)).toBe(4532);
    const restarted = new RenderProgress(t.files, t.clock);
    await vi.waitFor(async () => expect(await eta(restarted)).toBe(4532));
  });

  it("сборка упала — записи нет, замеры не меняются", async () => {
    const t = setup();
    t.progress.queued("print:o1", "package");
    await expect(
      t.progress.track("print:o1", async (report) => {
        report({ stage: "images", size: 50 });
        t.clock.ms += 5000;
        throw new Error("render crashed");
      }),
    ).rejects.toThrow("render crashed");
    expect(t.progress.snapshot("print:o1")).toBeNull();
    expect(t.files.keys()).not.toContain("cache/render-rates.json");
  });

  it("испорченный файл замеров не мешает: остаются начальные оценки", async () => {
    const t = setup();
    await t.files.put("cache/render-rates.json", Buffer.from("{не json"));
    const progress = new RenderProgress(t.files, t.clock);
    progress.queued("print:o1", "package");
    let eta: number | null = null;
    await progress.track("print:o1", async (report) => {
      report({ stage: "images", size: 50 });
      eta = progress.snapshot("print:o1")!.etaMs;
    });
    expect(eta).toBe(1850);
  });

  it("каркас обложки не зависит от объёма книги: срок известен сразу", async () => {
    const t = setup();
    t.progress.queued("layout:o1", "layout");
    let snap: ReturnType<RenderProgress["snapshot"]> = null;
    await t.progress.track("layout:o1", async () => {
      snap = t.progress.snapshot("layout:o1");
    });
    expect(snap).toMatchObject({ kind: "layout", stage: "finish", etaMs: 300 });
  });

  it("сборки заказа и книги ищутся по ключу очереди", () => {
    const t = setup();
    t.progress.queued("print:o1", "package");
    t.progress.queued("reading:o1", "reading");
    t.progress.queued("print:o2", "package");
    t.progress.queued("screen:b1:1", "screen");
    t.progress.queued("screen:b1:2", "screen");
    t.progress.queued("screen:b2:3", "screen");
    expect(t.progress.forOrder("o1").map((s) => s.kind)).toEqual(["package", "reading"]);
    expect(t.progress.forOrder("o3")).toEqual([]);
    expect(t.progress.forBook("b1")).toMatchObject({ kind: "screen", ahead: 3 });
    expect(t.progress.forBook("b9")).toBeNull();
  });
});

describe("ход сборки в PrintFilesService и BookPreviewService", () => {
  it("пока пакет печати рендерится, ход виден под ключом очереди print:<заказ>; после — записи нет", async () => {
    const t = setup();
    const during: unknown[] = [];
    t.renderer.onReport = (report) => {
      report?.({ stage: "images", size: 40 });
      report?.({ stage: "flow" });
      during.push(t.progress.forOrder("o1"));
    };
    await t.printFiles.prepare(job);
    expect(during).toEqual([[expect.objectContaining({ kind: "package", state: "running", stage: "flow" })]]);
    expect(t.progress.forOrder("o1")).toEqual([]);
  });

  it("читательская версия и каркас — свои сборки со своим видом", async () => {
    const t = setup();
    const kinds: string[] = [];
    t.renderer.onReport = () => void kinds.push(...t.progress.forOrder("o1").map((s) => s.kind));
    await t.printFiles.getFile(job, "reading");
    await t.printFiles.prepare(job);
    t.files.data.delete("orders/o1/layout.pdf");
    await t.printFiles.getFile(job, "layout");
    expect(kinds).toEqual(["reading", "package", "layout"]);
  });

  it("ensure собирает файл и ничего не читает; готовый файл не пересобирает", async () => {
    const t = setup();
    const get = vi.spyOn(t.files, "get");
    await t.printFiles.ensure(job, "block");
    await t.printFiles.ensure(job, "spec");
    await t.printFiles.ensure(job, "reading");
    await t.printFiles.ensure(job, "reading");
    expect(t.renderer.calls).toEqual(["package:b1:7", "reading:b1"]);
    expect(t.files.keys()).toEqual(["orders/o1/block.pdf", "orders/o1/cover.pdf", "orders/o1/layout.pdf", "orders/o1/reading.pdf", "orders/o1/spec.txt"]);
    expect(get).not.toHaveBeenCalled();
    // force пересобирает поверх кэша — кнопка «Перегенерировать».
    await t.printFiles.ensure(job, "block", { force: true });
    expect(t.renderer.calls).toEqual(["package:b1:7", "reading:b1", "package:b1:7"]);
  });

  it("ensure каркаса старого заказа собирает его из готовых блока и обложки", async () => {
    const t = setup();
    await t.printFiles.prepare(job);
    t.files.data.delete("orders/o1/layout.pdf");
    await t.printFiles.ensure(job, "layout");
    expect(t.files.keys()).toContain("orders/o1/layout.pdf");
  });

  it("экранная сборка книги: пока рендерится — ход виден по книге, готова — записи нет", async () => {
    const t = setup();
    t.renderer.onReport = (report) => {
      report?.({ stage: "images", size: 30 });
      report?.({ stage: "flow" });
    };
    t.renderer.pause();
    expect(t.previews.progressOf("b1")).toBeNull();
    expect(await t.previews.build("b1")).toMatchObject({ status: "building" });
    await vi.waitFor(() => expect(t.previews.progressOf("b1")).toMatchObject({ state: "running", stage: "flow" }));
    t.renderer.resume();
    await vi.waitFor(async () => expect(await t.previews.build("b1")).toMatchObject({ status: "ready" }));
    expect(t.previews.progressOf("b1")).toBeNull();
  });
});

describe("текст хода сборки", () => {
  const labels = ru.order.progress;

  it("срок без дрожания: до минуты шагом 5 с, дальше шагом 10; меньше 5 с — «почти готово»", () => {
    expect(formatEta(2_000, labels)).toBeNull();
    expect(formatEta(7_400, labels)).toBe("5 с");
    expect(formatEta(23_000, labels)).toBe("25 с");
    expect(formatEta(65_000, labels)).toBe("1 мин 10 с");
    expect(formatEta(120_000, labels)).toBe("2 мин");
  });

  it("сводка одной строкой: проценты и остаток; в очереди и без сборки — пусто", () => {
    const running = { state: "running", stage: "flow", percent: 45, etaMs: 21_000, overrun: false, ahead: 0 } as const;
    expect(progressSummary(running, labels)).toBe("45% · осталось ≈ 20 с");
    expect(progressSummary({ ...running, etaMs: 1000 }, labels)).toBe("45% · почти готово");
    expect(progressSummary({ ...running, overrun: true }, labels)).toBe("45% · дольше обычного — ещё немного");
    expect(progressSummary({ ...running, state: "queued" }, labels)).toBe("");
    expect(progressSummary(null, labels)).toBe("");
  });

  it("на казахском те же этапы и тот же набор текстов", () => {
    expect(Object.keys(kk.order.progress)).toEqual(Object.keys(ru.order.progress));
    expect(Object.keys(kk.order.progress.stages)).toEqual(Object.keys(ru.order.progress.stages));
    expect(progressSummary({ state: "running", stage: "flow", percent: 45, etaMs: 21_000, overrun: false, ahead: 0 }, kk.order.progress)).toBe("45% · шамамен 20 сек қалды");
  });
});
