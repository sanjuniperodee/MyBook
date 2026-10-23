import { describe, expect, it } from "vitest";
import { BookPreviewService, RasterizerMissingError } from "@/modules/production";
import { job, setup } from "./doubles/production";

const printKeys = ["orders/o1/block.pdf", "orders/o1/cover.pdf", "orders/o1/layout.pdf", "orders/o1/spec.txt"];

describe("PrintFilesService: файлы для типографии", () => {
  it("первый раз рендерит пакет в очереди print:<заказ> и кладёт четыре файла, второй — берёт из кэша", async () => {
    const t = setup();
    expect(await t.printFiles.prepare(job)).toMatchObject({ format: "a5", pageCount: 65 });
    expect(t.renderer.calls).toEqual(["package:b1:7"]);
    expect(t.queue.started).toEqual(["print:o1"]);
    expect(t.files.keys()).toEqual(printKeys);
    expect(t.files.text("orders/o1/spec.txt")).toBe("spec#1");
    expect(await t.printFiles.prepare(job)).toBeNull();
    expect(t.renderer.calls).toHaveLength(1);
  });

  it("кэш — это блок, обложка и спецификация; без каркаса пакет заново не рендерится", async () => {
    const t = setup();
    await t.printFiles.prepare(job);
    t.files.data.delete("orders/o1/layout.pdf");
    expect(await t.printFiles.prepare(job)).toBeNull();
    t.files.data.delete("orders/o1/spec.txt");
    expect(await t.printFiles.prepare(job)).toMatchObject({ pageCount: 66 });
    expect(t.renderer.calls).toEqual(["package:b1:7", "package:b1:7"]);
  });

  it("force рендерит заново поверх кэша", async () => {
    const t = setup();
    await t.printFiles.prepare(job);
    expect(await t.printFiles.prepare(job, { force: true })).toMatchObject({ pageCount: 66 });
    expect(t.files.text("orders/o1/block.pdf")).toBe("block#2");
    expect(await t.printFiles.getFile(job, "cover", { force: true })).toEqual(Buffer.from("cover#3"));
    // force по каркасу: пакет перерисован вместе с каркасом, отдельный рендер каркаса не нужен
    expect((await t.printFiles.getFile(job, "layout", { force: true })).toString()).toBe("layout#4");
    expect(t.renderer.calls).toEqual(Array(4).fill("package:b1:7"));
  });

  it("пересборка пакета сбрасывает старую читательскую версию — следующий запрос собирает её заново", async () => {
    const t = setup();
    await t.printFiles.getFile(job, "reading");
    await t.printFiles.prepare(job, { force: true });
    expect(t.files.keys()).not.toContain("orders/o1/reading.pdf");
    expect((await t.printFiles.getFile(job, "reading")).toString()).toBe("reading#3");
    expect(t.renderer.calls).toEqual(["reading:b1", "package:b1:7", "reading:b1"]);
  });

  it("книги нет — ошибка «book … not found», файлы не пишутся", async () => {
    const t = setup();
    const lost = { ...job, bookId: "gone" };
    await expect(t.printFiles.prepare(lost)).rejects.toThrow("book gone not found");
    await expect(t.printFiles.getFile(lost, "block")).rejects.toThrow("book gone not found");
    await expect(t.printFiles.getFile(lost, "reading")).rejects.toThrow("book gone not found");
    expect(t.files.puts).toEqual([]);
  });

  it("getFile блока, обложки и спецификации: готовит пакет при необходимости и отдаёт файл", async () => {
    const t = setup();
    expect((await t.printFiles.getFile(job, "block")).toString()).toBe("block#1");
    expect((await t.printFiles.getFile(job, "spec")).toString()).toBe("spec#1");
    expect((await t.printFiles.getFile(job, "cover")).toString()).toBe("cover#1");
    expect(t.renderer.calls).toEqual(["package:b1:7"]);
  });

  it("каркас для старого заказа собирается из готовых блока и обложки в очереди layout:<заказ>", async () => {
    const t = setup();
    await t.printFiles.prepare(job);
    t.files.data.delete("orders/o1/layout.pdf");
    expect((await t.printFiles.getFile(job, "layout")).toString()).toBe("layout(block#1+cover#1)");
    expect(t.renderer.calls).toEqual(["package:b1:7", "layout:b1:block#1+cover#1"]);
    expect(t.queue.started).toEqual(["print:o1", "layout:o1"]);
    expect(t.files.text("orders/o1/layout.pdf")).toBe("layout(block#1+cover#1)");
    await t.printFiles.getFile(job, "layout");
    expect(t.renderer.calls).toHaveLength(2);
  });

  it("каркас не собрался — ошибка, в хранилище ничего нового", async () => {
    const t = setup();
    await t.printFiles.prepare(job);
    t.files.data.delete("orders/o1/layout.pdf");
    t.renderer.books.delete("b1");
    await expect(t.printFiles.getFile(job, "layout")).rejects.toThrow("book b1 not found");
    expect(t.files.keys()).not.toContain("orders/o1/layout.pdf");
  });

  it("читательская версия — свой файл и очередь reading:<заказ>, пакет для печати не трогает; force — заново", async () => {
    const t = setup();
    expect((await t.printFiles.getFile(job, "reading")).toString()).toBe("reading#1");
    expect(t.files.keys()).toEqual(["orders/o1/reading.pdf"]);
    expect(t.queue.started).toEqual(["reading:o1"]);
    await t.printFiles.getFile(job, "reading");
    expect((await t.printFiles.getFile(job, "reading", { force: true })).toString()).toBe("reading#2");
    expect(t.renderer.calls).toEqual(["reading:b1", "reading:b1"]);
  });

  it("одновременные запросы одного заказа склеиваются в один рендер, разные очереди — нет", async () => {
    const t = setup();
    const [a, b, r] = await Promise.all([t.printFiles.getFile(job, "block"), t.printFiles.getFile(job, "cover"), t.printFiles.getFile(job, "reading")]);
    expect([a.toString(), b.toString()]).toEqual(["block#1", "cover#1"]);
    expect(r.toString()).toBe("reading#2");
    expect(t.queue.requested).toEqual(["print:o1", "print:o1", "reading:o1"]);
    expect(t.queue.started).toEqual(["print:o1", "reading:o1"]);
    expect(t.renderer.calls).toEqual(["package:b1:7", "reading:b1"]);
  });

  it("прогрев после оплаты: пакет и читательская версия; повторно — «из кэша» без рендера", async () => {
    const t = setup();
    expect(await t.printFiles.warmUp(job)).toMatchObject({ status: "rendered", spec: { pageCount: 65 } });
    expect(t.files.keys()).toEqual([...printKeys, "orders/o1/reading.pdf"].sort());
    expect(await t.printFiles.warmUp(job)).toEqual({ status: "cached", spec: null });
    expect(t.renderer.calls).toEqual(["package:b1:7", "reading:b1"]);
    expect(t.logger.errors).toEqual([]);
  });

  it("прогрев не бросает: ошибка в лог, «сбой» отличается от «из кэша»; собранный пакет не теряется (B12)", async () => {
    const t = setup();
    expect(await t.printFiles.warmUp({ ...job, bookId: "gone" })).toEqual({ status: "failed", spec: null });
    expect(t.logger.errors).toEqual([{ message: "warm-up failed for order 7", error: new Error("book gone not found") }]);
    // пакет отрендерен, упала читательская версия — параметры печати остаются
    t.renderer.crash.add("reading");
    expect(await t.printFiles.warmUp(job)).toMatchObject({ status: "failed", spec: { pageCount: 65 } });
    expect(t.files.keys()).toEqual(printKeys);
    expect(t.logger.errors[1]).toEqual({ message: "warm-up failed for order 7", error: new Error("reading crashed") });
  });
});

describe("BookPreviewService: экранная сборка и предпросмотр", () => {
  /** Сборка в кэше: манифест и PDF; у неоплаченной книги — и PDF со знаком. */
  const screen = (fp: string, book = "b1") => [`cache/preview/${book}/${fp}.json`, `cache/preview/${book}/${fp}.pdf`];
  const built = (fp: string, book = "b1") => [`cache/preview/${book}/${fp}-wm.pdf`, ...screen(fp, book)];
  const renders = (t: ReturnType<typeof setup>) => t.renderer.calls.filter((c) => c.startsWith("render:"));

  it("до оплаты — экранная сборка без знака и знак поверх неё, поставленный сразу при сборке; повторно ни рендера, ни знака", async () => {
    const t = setup();
    expect((await t.previews.preview("b1"))?.toString()).toBe("preview fp1 +wm");
    expect(t.files.keys()).toEqual(built("fp1"));
    expect(t.files.text("cache/preview/b1/fp1.pdf")).toBe("preview fp1");
    // манифест пишется последним: пока его нет, сборка не готова
    expect(t.files.puts).toEqual(["cache/preview/b1/fp1.pdf", "cache/preview/b1/fp1-wm.pdf", "cache/preview/b1/fp1.json"]);
    expect(t.queue.started).toEqual(["screen:b1:1"]);
    expect((await t.previews.preview("b1"))?.toString()).toBe("preview fp1 +wm");
    // отпечаток — при каждом запросе, в начале сборки (книга как сейчас) и при уборке; PDF и знак — один раз
    expect(t.renderer.calls).toEqual(["preview:b1", "preview:b1", "render:b1:fp1", "watermark:b1", "preview:b1", "preview:b1"]);
  });

  it("после оплаты — та же экранная сборка как есть: без знака и без нового рендера; оплаченной книге знак не ставится", async () => {
    const t = setup();
    await t.previews.preview("b1");
    t.pay("b1");
    expect((await t.previews.preview("b1"))?.toString()).toBe("preview fp1");
    expect(renders(t)).toHaveLength(1);

    const paid = setup();
    paid.pay("b1");
    await paid.previews.build("b1");
    await paid.queue.idle();
    expect(paid.files.keys()).toEqual(screen("fp1"));
    expect(paid.renderer.calls).not.toContain("watermark:b1");
  });

  it("манифест: полосы по порядку, добивка, адрес картинок; JSON лежит рядом с PDF без адреса, с версией сборки", async () => {
    const t = setup();
    expect(await t.previews.build("b1")).toEqual({ status: "building", previous: null });
    await t.queue.idle();
    const state = await t.previews.build("b1");
    expect(state).toEqual({
      status: "ready",
      build: { fp: "fp1", pageCount: 8, contentPages: 7, trimMm: { w: 148, h: 210 }, pages: expect.any(Array), chapterPages: { c1: 4 }, imageBase: "/api/books/b1/pages/fp1" },
    });
    if (state?.status !== "ready") throw new Error("not ready");
    expect(state.build.pages.map((p) => p.kind)).toEqual(["front", "front", "toc", "opener", "text", "text", "end", "pad"]);
    expect(state.build.pages[3]).toEqual({ n: 4, kind: "opener", chapterKey: "c1" });
    const stored = JSON.parse(t.files.text("cache/preview/b1/fp1.json")!);
    expect(stored).not.toHaveProperty("imageBase");
    expect(stored.v).toEqual(expect.any(Number));
  });

  it("книга изменилась — «собирается» с прошлой готовой; прошлая и её картинки удаляются после записи новой; чужой кэш не тронут", async () => {
    const t = setup();
    t.renderer.books.set("b2", { fingerprint: "other" });
    await t.previews.preview("b2");
    await t.previews.preview("b1");
    await t.previews.pageImage("b1", "fp1", 1, 480);
    t.renderer.books.set("b1", { fingerprint: "fp2" });
    const state = await t.previews.build("b1");
    expect(state).toMatchObject({ status: "building", previous: { fp: "fp1", imageBase: "/api/books/b1/pages/fp1" } });
    await t.queue.idle();
    expect(t.files.keys()).toEqual([...built("fp2"), ...built("other", "b2")]);
    expect(await t.previews.build("b1")).toMatchObject({ status: "ready", build: { fp: "fp2" } });
  });

  it("автор правит, экран опрашивает: на книгу ждёт одна сборка, и верстается то, что в книге, когда дошла очередь", async () => {
    const t = setup();
    // слот рендера занят (другая книга, печать заказа)
    t.queue.pause();
    for (const fp of ["fp1", "fp2", "fp3"]) {
      t.renderer.books.set("b1", { fingerprint: fp });
      expect(await t.previews.build("b1")).toEqual({ status: "building", previous: null });
    }
    expect(t.queue.requested).toEqual(["screen:b1:1"]);
    t.queue.resume();
    await t.queue.idle();
    expect(renders(t)).toEqual(["render:b1:fp3"]);
    expect(t.files.keys()).toEqual(built("fp3"));
  });

  it("книгу поменяли, пока шла сборка, — следующая встаёт в очередь после неё, промежуточные отпечатки не верстаются", async () => {
    const t = setup();
    t.renderer.pause();
    await t.previews.build("b1");
    for (const fp of ["fp2", "fp3"]) {
      t.renderer.books.set("b1", { fingerprint: fp });
      expect(await t.previews.build("b1")).toEqual({ status: "building", previous: null });
    }
    // вторая сборка ждёт первую и в очередь ещё не встала: одну книгу не верстают дважды сразу
    expect(t.queue.requested).toEqual(["screen:b1:1"]);
    t.renderer.resume();
    await t.queue.idle();
    expect(renders(t)).toEqual(["render:b1:fp1", "render:b1:fp3"]);
    expect(t.queue.requested).toEqual(["screen:b1:1", "screen:b1:2"]);
    expect(t.files.keys()).toEqual(built("fp3"));
  });

  it("книгу поменяли, пока шла сборка, — записанная сборка ничего не удаляет: свежую мог записать другой рендер", async () => {
    const t = setup();
    await t.previews.build("b1");
    await t.queue.idle();
    t.renderer.pause();
    t.renderer.books.set("b1", { fingerprint: "fp2" });
    await t.previews.build("b1");
    t.renderer.books.set("b1", { fingerprint: "fp3" });
    t.renderer.resume();
    await t.queue.idle();
    expect(t.files.keys()).toEqual([...built("fp1"), ...built("fp2")]);
    // прошлая для новой — самая свежая из записанных
    expect(await t.previews.build("b1")).toMatchObject({ status: "building", previous: { fp: "fp2" } });
    await t.queue.idle();
    expect(t.files.keys()).toEqual(built("fp3"));
  });

  it("книгу удалили до сборки — ничего не верстается; во время сборки — записанное удаляется", async () => {
    const before = setup();
    before.queue.pause();
    await before.previews.build("b1");
    before.renderer.books.delete("b1");
    before.queue.resume();
    await before.queue.idle();
    expect(renders(before)).toEqual([]);
    expect(before.files.puts).toEqual([]);

    const during = setup();
    await during.previews.build("b1");
    await during.queue.idle();
    await during.previews.pageImage("b1", "fp1", 1, 480);
    during.renderer.books.set("b1", { fingerprint: "fp2" });
    during.renderer.pause();
    await during.previews.build("b1");
    during.renderer.books.delete("b1");
    during.renderer.resume();
    await during.queue.idle();
    expect(during.files.keys()).toEqual([]);
  });

  it("одновременные запросы — один рендер и один знак", async () => {
    const t = setup();
    const [a, b] = await Promise.all([t.previews.preview("b1"), t.previews.preview("b1"), t.previews.build("b1")]);
    expect(a).toEqual(b);
    expect(renders(t)).toHaveLength(1);
    expect(t.renderer.calls.filter((c) => c.startsWith("watermark:"))).toHaveLength(1);
  });

  it("упавшая сборка: экрану — код, подробности — в лог; пауза перед повтором растёт (минута, 5, 30), потом — пока книга не изменится", async () => {
    const t = setup();
    t.renderer.crash.add("preview");
    expect(await t.previews.build("b1")).toEqual({ status: "building", previous: null });
    await t.queue.idle();
    expect(await t.previews.build("b1")).toEqual({ status: "failed", previous: null, error: "renderFailed", retryInMs: 60_000 });
    expect(t.logger.errors).toHaveLength(1);
    expect(t.logger.errors[0].message).toContain("b1");
    expect((t.logger.errors[0].error as Error).message).toBe("preview crashed");
    for (const [hold, count] of [
      [60_000, 2],
      [5 * 60_000, 3],
      [30 * 60_000, 4],
    ] as const) {
      t.clock.ms += hold - 1_000;
      expect(await t.previews.build("b1")).toMatchObject({ status: "failed" });
      t.clock.ms += 1_000;
      expect(await t.previews.build("b1")).toMatchObject({ status: "building" });
      await t.queue.idle();
      expect(renders(t)).toHaveLength(count);
    }
    t.clock.ms += 86_400_000;
    expect(await t.previews.build("b1")).toMatchObject({ status: "failed" });
    // скачивание тоже не верстает заново
    await expect(t.previews.preview("b1")).rejects.toThrow(/failed recently/);
    expect(renders(t)).toHaveLength(4);
    expect(t.logger.errors).toHaveLength(4);
    // книга изменилась — собирается сразу
    t.renderer.crash.delete("preview");
    t.renderer.books.set("b1", { fingerprint: "fp2" });
    expect(await t.previews.build("b1")).toEqual({ status: "building", previous: null });
    await t.queue.idle();
    expect(await t.previews.build("b1")).toMatchObject({ status: "ready", build: { fp: "fp2" } });
    expect(t.files.keys()).toEqual(built("fp2"));
  });

  it("«Попробовать снова» после сбоя: не раньше минуты (ответ — через сколько), потом пауза снимается один раз; опрос паузу не снимает", async () => {
    const t = setup();
    t.renderer.crash.add("preview");
    await t.previews.build("b1");
    await t.queue.idle();
    t.clock.ms += 20_000;
    expect(await t.previews.build("b1", { retry: true })).toEqual({ status: "failed", previous: null, error: "renderFailed", retryInMs: 40_000 });
    expect(renders(t)).toHaveLength(1);
    t.clock.ms += 40_000;
    // пауза после первого сбоя — минута: дальше опрос и сам перезапустил бы; после второго — 5 минут
    expect(await t.previews.build("b1")).toMatchObject({ status: "building" });
    await t.queue.idle();
    expect(renders(t)).toHaveLength(2);
    t.clock.ms += 60_000;
    expect(await t.previews.build("b1")).toMatchObject({ status: "failed", retryInMs: 0 });
    t.queue.pause();
    expect(await t.previews.build("b1", { retry: true })).toEqual({ status: "building", previous: null });
    // пока повтор ждёт очереди, опрос присоединяется к нему, а не отвечает «ошибка»
    expect(await t.previews.build("b1")).toEqual({ status: "building", previous: null });
    t.queue.resume();
    await t.queue.idle();
    expect(renders(t)).toHaveLength(3);
    // снова упала — снова пауза (и минута до следующего ручного повтора)
    expect(await t.previews.build("b1")).toMatchObject({ status: "failed", retryInMs: 60_000 });
    expect(await t.previews.build("b1", { retry: true })).toMatchObject({ status: "failed" });
    t.renderer.crash.delete("preview");
    t.clock.ms += 60_000;
    expect(await t.previews.build("b1", { retry: true })).toMatchObject({ status: "building" });
    await t.queue.idle();
    expect(await t.previews.build("b1")).toMatchObject({ status: "ready", build: { fp: "fp1" } });
    expect(renders(t)).toHaveLength(4);
  });

  it("готовая сборка текущей книги для числа страниц: только из кэша, ничего не собирает", async () => {
    const t = setup();
    expect(await t.previews.current("b1")).toBeNull();
    expect(await t.previews.current("gone")).toBeNull();
    expect(renders(t)).toEqual([]);
    expect(t.queue.requested).toEqual([]);
    await t.previews.build("b1");
    await t.queue.idle();
    expect(await t.previews.current("b1")).toMatchObject({ fp: "fp1", pageCount: 8, contentPages: 7, chapterPages: { c1: 4 } });
    // книгу поправили — готовой нет, пока макет не соберут
    t.renderer.books.set("b1", { fingerprint: "fp2" });
    expect(await t.previews.current("b1")).toBeNull();
    expect(renders(t)).toHaveLength(1);
  });

  it("сбой уборки после записи — сборка всё равно готова (в лог — предупреждение, не ошибка сборки)", async () => {
    const t = setup();
    t.queue.pause();
    await t.previews.build("b1");
    t.files.failList = true;
    t.queue.resume();
    await t.queue.idle();
    t.files.failList = false;
    expect(t.logger.errors).toEqual([]);
    expect(t.logger.warns).toEqual([expect.stringContaining("prune")]);
    expect(await t.previews.build("b1")).toMatchObject({ status: "ready", build: { fp: "fp1" } });
    expect((await t.previews.preview("b1"))?.toString()).toBe("preview fp1 +wm");
    expect(renders(t)).toHaveLength(1);
  });

  it("тот же отпечаток собирается заново (манифест другой версии сборки или испорчен) — картинки и знак прошлого PDF удаляются", async () => {
    const t = setup();
    await t.previews.build("b1");
    await t.queue.idle();
    await t.previews.pageImage("b1", "fp1", 1, 480);
    const key = "cache/preview/b1/fp1.json";
    t.files.data.set(key, Buffer.from(JSON.stringify({ ...JSON.parse(t.files.text(key)!), v: 0 })));
    expect(await t.previews.build("b1")).toEqual({ status: "building", previous: null });
    await t.queue.idle();
    expect(t.files.keys()).toEqual(built("fp1"));
    expect(renders(t)).toHaveLength(2);
    expect(t.renderer.calls.filter((c) => c.startsWith("watermark:"))).toHaveLength(2);
    t.files.data.set(key, Buffer.from("{"));
    expect(await t.previews.build("b1")).toMatchObject({ status: "building" });
    await t.queue.idle();
    expect(await t.previews.build("b1")).toMatchObject({ status: "ready" });
    expect(renders(t)).toHaveLength(3);
  });

  it("уборка после сборки: недописанные временные файлы старше часа удаляются, свежие — нет (запись, может, ещё идёт)", async () => {
    const t = setup();
    await t.files.put("cache/preview/b1/old.pdf.tmp-1-aa", Buffer.from("x"));
    t.clock.ms += 2 * 3_600_000;
    await t.files.put("cache/preview/b1/fp1-wm.pdf.tmp-2-bb", Buffer.from("x"));
    await t.previews.build("b1");
    await t.queue.idle();
    expect(t.files.keys()).toEqual(["cache/preview/b1/fp1-wm.pdf", "cache/preview/b1/fp1-wm.pdf.tmp-2-bb", ...screen("fp1")]);
  });

  it("картинки полос: всегда растр чистого PDF; до оплаты не крупнее 800 (и браузеру перепроверять), после — как просили; растр один раз на полосу и ширину; добивка — белая; чужие — null", async () => {
    const t = setup();
    expect(await t.previews.pageImage("b1", "fp1", 1, 480)).toBeNull();
    await t.previews.build("b1");
    await t.queue.idle();
    const small = { data: Buffer.from("page 1@480 of cache/preview/b1/fp1.pdf"), limited: false };
    const [a, b] = await Promise.all([t.previews.pageImage("b1", "fp1", 1, 480), t.previews.pageImage("b1", "fp1", 1, 480)]);
    expect(a).toEqual(small);
    expect(b).toEqual(small);
    expect(await t.previews.pageImage("b1", "fp1", 1, 800)).toEqual({ data: Buffer.from("page 1@800 of cache/preview/b1/fp1.pdf"), limited: false });
    // крупнее 800 до оплаты не отдаём: та же картинка 800, растр не повторяется
    expect(await t.previews.pageImage("b1", "fp1", 1, 1600)).toEqual({ data: Buffer.from("page 1@800 of cache/preview/b1/fp1.pdf"), limited: true });
    expect(await t.previews.pageImage("b1", "fp1", 8, 1200)).toEqual({ data: Buffer.from("blank@800"), limited: true });
    t.pay("b1");
    expect(await t.previews.pageImage("b1", "fp1", 1, 1600)).toEqual({ data: Buffer.from("page 1@1600 of cache/preview/b1/fp1.pdf"), limited: false });
    expect(await t.previews.pageImage("b1", "fp1", 1, 480)).toEqual(small);
    expect(t.raster.calls).toEqual(["page:cache/preview/b1/fp1.pdf:1@480", "page:cache/preview/b1/fp1.pdf:1@800", "blank@800", "page:cache/preview/b1/fp1.pdf:1@1600"]);
    expect(t.files.keys().filter((k) => k.startsWith("cache/pages/"))).toEqual([
      "cache/pages/b1/fp1/1-1600.webp",
      "cache/pages/b1/fp1/1-480.webp",
      "cache/pages/b1/fp1/1-800.webp",
      "cache/pages/b1/fp1/8-800.webp",
    ]);
    expect(await t.previews.pageImage("b1", "fp1", 9, 480)).toBeNull();
    expect(await t.previews.pageImage("b1", "fp1", 0, 480)).toBeNull();
    expect(await t.previews.pageImage("b1", "fp0", 1, 480)).toBeNull();
  });

  it("знак не поставился при сборке — сборка готова, картинки полос от знака не зависят; знак ставится при скачивании PDF, тоже в очереди рендера", async () => {
    const t = setup();
    t.renderer.crash.add("watermark");
    await t.previews.build("b1");
    await t.queue.idle();
    expect(await t.previews.build("b1")).toMatchObject({ status: "ready" });
    expect(t.logger.warns).toEqual([expect.stringContaining("watermark")]);
    expect(t.files.keys()).toEqual(screen("fp1"));
    expect((await t.previews.pageImage("b1", "fp1", 2, 480))?.data.toString()).toBe("page 2@480 of cache/preview/b1/fp1.pdf");
    t.renderer.crash.delete("watermark");
    expect((await t.previews.preview("b1"))?.toString()).toBe("preview fp1 +wm");
    expect(t.queue.started).toEqual(["screen:b1:1", "cache/preview/b1/fp1-wm.pdf"]);
    expect(t.files.text("cache/preview/b1/fp1-wm.pdf")).toBe("preview fp1 +wm");
  });

  it("запрос картинки ушёл (полосу пролистали): растр, который никто не ждёт, отменяется и не пишется; кто-то ждёт — доделывается", async () => {
    const t = setup();
    t.pay("b1");
    await t.previews.build("b1");
    await t.queue.idle();
    t.raster.hold();
    const a = new AbortController();
    const b = new AbortController();
    const first = t.previews.pageImage("b1", "fp1", 2, 480, a.signal);
    const second = t.previews.pageImage("b1", "fp1", 2, 480, b.signal);
    await new Promise((resolve) => setTimeout(resolve, 0));
    // один растр на оба запроса; первый ушёл — второй всё ещё ждёт, растр идёт
    a.abort();
    await expect(first).rejects.toThrow();
    expect(t.raster.signals[0]?.aborted).toBe(false);
    // ушёл и второй — растр отменён, в кэш ничего
    b.abort();
    await expect(second).rejects.toThrow();
    expect(t.raster.signals[0]?.aborted).toBe(true);
    t.raster.release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(t.files.keys().filter((k) => k.startsWith("cache/pages/"))).toEqual([]);
    // новый запрос той же полосы не присоединяется к отменённому — растр заново
    expect((await t.previews.pageImage("b1", "fp1", 2, 480, new AbortController().signal))?.data.toString()).toBe("page 2@480 of cache/preview/b1/fp1.pdf");
    expect(t.raster.calls).toEqual(["page:cache/preview/b1/fp1.pdf:2@480", "page:cache/preview/b1/fp1.pdf:2@480"]);
    // уже ушедший запрос растр не заводит вовсе
    const gone = new AbortController();
    gone.abort();
    await expect(t.previews.pageImage("b1", "fp1", 3, 480, gone.signal)).rejects.toThrow();
    expect(t.raster.calls).toHaveLength(2);
    // запрос без отмены (свой, не браузера) растр не бросает, даже если браузерные ушли
    t.raster.hold();
    const c = new AbortController();
    const browser = t.previews.pageImage("b1", "fp1", 4, 480, c.signal);
    const own = t.previews.pageImage("b1", "fp1", 4, 480);
    await new Promise((resolve) => setTimeout(resolve, 0));
    c.abort();
    await expect(browser).rejects.toThrow();
    t.raster.release();
    expect((await own)?.data.toString()).toBe("page 4@480 of cache/preview/b1/fp1.pdf");
    expect(t.files.keys()).toContain("cache/pages/b1/fp1/4-480.webp");
  });

  it("нет pdftoppm — ошибка растра наружу (маршрут ответит 503), в кэш ничего не пишется", async () => {
    const t = setup();
    await t.previews.build("b1");
    await t.queue.idle();
    t.raster.missing = true;
    await expect(t.previews.pageImage("b1", "fp1", 2, 480)).rejects.toSatisfy((err) => RasterizerMissingError.is(err));
    expect(t.files.keys().filter((k) => k.startsWith("cache/pages/"))).toEqual([]);
  });

  it("уборка кэша: картинки полос без новых неделю, сборки без пересборки месяц; не чаще раза в сутки", async () => {
    const day = 86_400_000;
    const t = setup();
    t.renderer.books.set("b2", { fingerprint: "other" });
    await t.previews.build("b1");
    await t.previews.build("b2");
    await t.queue.idle();
    await t.previews.pageImage("b1", "fp1", 1, 480);
    t.clock.ms += 8 * day;
    await t.previews.pageImage("b2", "other", 1, 480);
    expect(await t.previews.sweep()).toBe(1);
    expect(t.files.keys().filter((k) => k.startsWith("cache/pages/"))).toEqual(["cache/pages/b2/other/1-480.webp"]);
    // сборки моложе месяца остаются
    expect(await t.previews.build("b1")).toMatchObject({ status: "ready" });
    t.clock.ms += 23 * day;
    expect(await t.previews.sweep()).toBe(3);
    expect(t.files.keys()).toEqual([]);
    // не чаще раза в сутки
    const now = t.clock.ms;
    t.clock.ms = now - 40 * day;
    await t.files.put("cache/preview/b3/x.json", Buffer.from("{}"));
    t.clock.ms = now + 3_600_000;
    expect(await t.previews.sweep()).toBe(0);
    t.clock.ms = now + day;
    expect(await t.previews.sweep()).toBe(1);
  });

  it("книги нет — null без записи и очереди; текст книги — как отдал рендер", async () => {
    const t = setup();
    expect(await t.previews.preview("gone")).toBeNull();
    expect(await t.previews.build("gone")).toBeNull();
    expect(await t.previews.pageImage("gone", "fp1", 1, 480)).toBeNull();
    expect(t.queue.requested).toEqual([]);
    expect(t.files.puts).toEqual([]);
    expect(await t.previews.manuscript("b1")).toEqual({ title: "Ты — моё всё", text: "Глава 1" });
    expect(await t.previews.manuscript("gone")).toBeNull();
  });

  it("без проверки оплаты водяной знак есть всегда", async () => {
    const t = setup();
    t.pay("b1");
    const previews = new BookPreviewService(t.renderer, t.files, t.queue, t.raster, t.logger);
    expect((await previews.preview("b1"))?.toString()).toBe("preview fp1 +wm");
  });
});
