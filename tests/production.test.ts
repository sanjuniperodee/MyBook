import { describe, expect, it } from "vitest";
import { BookPreviewService } from "@/modules/production";
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

describe("BookPreviewService: предпросмотр книги", () => {
  it("до оплаты — с водяным знаком; кэш по отпечатку: повторно render не вызывается", async () => {
    const t = setup();
    expect((await t.previews.preview("b1"))?.toString()).toBe("preview fp1 wm");
    expect(t.files.keys()).toEqual(["cache/preview/b1/fp1.pdf"]);
    expect(t.queue.started).toEqual(["cache/preview/b1/fp1.pdf"]);
    expect((await t.previews.preview("b1"))?.toString()).toBe("preview fp1 wm");
    // отпечаток считается каждый раз, PDF рисуется один раз
    expect(t.renderer.calls).toEqual(["preview:b1:wm", "render:b1", "preview:b1:wm"]);
  });

  it("после оплаты — без водяного знака в отдельном файле -clean, версия со знаком удаляется", async () => {
    const t = setup();
    await t.previews.preview("b1");
    t.pay("b1");
    expect((await t.previews.preview("b1"))?.toString()).toBe("preview fp1 clean");
    expect(t.renderer.calls).toEqual(["preview:b1:wm", "render:b1", "preview:b1:clean", "render:b1"]);
    expect(t.files.keys()).toEqual(["cache/preview/b1/fp1-clean.pdf"]);
  });

  it("книга изменилась — новый отпечаток, новый рендер, старые версии удалены; чужой кэш не тронут", async () => {
    const t = setup();
    t.renderer.books.set("b2", { fingerprint: "other" });
    await t.previews.preview("b2");
    await t.previews.preview("b1");
    t.renderer.books.set("b1", { fingerprint: "fp2" });
    expect((await t.previews.preview("b1"))?.toString()).toBe("preview fp2 wm");
    expect(t.files.keys()).toEqual(["cache/preview/b1/fp2.pdf", "cache/preview/b2/other.pdf"]);
  });

  it("одновременные запросы — один рендер (ключ очереди — файл кэша)", async () => {
    const t = setup();
    const [a, b] = await Promise.all([t.previews.preview("b1"), t.previews.preview("b1")]);
    expect(a).toBe(b);
    expect(t.queue.requested).toEqual(["cache/preview/b1/fp1.pdf", "cache/preview/b1/fp1.pdf"]);
    expect(t.renderer.calls.filter((c) => c.startsWith("render:"))).toHaveLength(1);
  });

  it("книги нет — null без записи и очереди; текст книги — как отдал рендер", async () => {
    const t = setup();
    expect(await t.previews.preview("gone")).toBeNull();
    expect(t.queue.requested).toEqual([]);
    expect(t.files.puts).toEqual([]);
    expect(await t.previews.manuscript("b1")).toEqual({ title: "Ты — моё всё", text: "Глава 1" });
    expect(await t.previews.manuscript("gone")).toBeNull();
  });

  it("без проверки оплаты водяной знак есть всегда", async () => {
    const t = setup();
    t.pay("b1");
    const previews = new BookPreviewService(t.renderer, t.files, t.queue);
    expect((await previews.preview("b1"))?.toString()).toBe("preview fp1 wm");
  });
});
