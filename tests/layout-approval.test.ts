import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { canDownloadFile, layoutApprovalState, layoutBlock, Order, type LayoutApproval } from "@/modules/ordering/domain";
import { PrintLayoutChangedError } from "@/modules/production/application/PrintFilesService";
import { printFingerprint } from "@/modules/production/infrastructure/pdf/printFingerprint";
import type { BookBundle } from "@/modules/production/infrastructure/pdf/render";
import type { Book, Photo } from "@/shared/infrastructure/db/schema";
import { fixtureBook } from "./fixtures/books";
import { admin, setup } from "./doubles/ordering";
import { job, setup as production } from "./doubles/production";

/**
 * Согласование итогового макета клиентом (решение владельца 27.11.2026, заказ №93): файлы для типографии и печать —
 * только после того, как покупатель согласовал книгу, и только ту версию, что согласована. «Открыть для правок»
 * сбрасывает согласие: клиент согласует заново, даже если ничего не поменял.
 */

const none: LayoutApproval = { required: false, approvedAt: null, fingerprint: null, revokedAt: null };
const pending: LayoutApproval = { required: true, approvedAt: null, fingerprint: null, revokedAt: null };
const approved: LayoutApproval = { required: true, approvedAt: new Date("2026-11-27T10:00:00Z"), fingerprint: "fp-a", revokedAt: null };
const same = { fingerprint: "fp-a", bookOpen: false };

describe("домен: состояние согласования и доступ к печатным файлам", () => {
  it("согласовано та же версия — можно; не согласовано — «ждёт»; изменили после — «изменён»; открыта для правок — нельзя", () => {
    expect(layoutApprovalState(approved, same)).toEqual({ state: "approved", again: false });
    expect(layoutBlock(approved, same)).toBeNull();
    expect(layoutBlock(pending, same)).toBe("layoutNotApproved");
    expect(layoutBlock(approved, { fingerprint: "fp-b", bookOpen: false })).toBe("layoutChanged");
    expect(layoutBlock(approved, { fingerprint: "fp-a", bookOpen: true })).toBe("layoutBookEditing");
    // Книгу не прочитали — не считаем согласованной.
    expect(layoutBlock(approved, null)).toBe("layoutChanged");
    expect(layoutBlock(pending, null)).toBe("layoutNotApproved");
  });

  it("электронный тариф и заказы, которые к выпуску уже были в печати, — без согласования: всё как раньше", () => {
    expect(layoutApprovalState(none, null)).toEqual({ state: "notRequired", again: false });
    expect(layoutBlock(none, { fingerprint: "что угодно", bookOpen: true })).toBeNull();
  });

  it("после сброса («Открыть для правок») — ждёт повторного согласования", () => {
    expect(layoutApprovalState({ ...pending, revokedAt: new Date() }, same)).toEqual({ state: "pending", again: true });
  });

  it("canDownloadFile: печатные файлы сотруднику и покупателю — только согласованного макета; PDF для чтения не закрывается", () => {
    const staff = { userId: "s", can: () => true };
    const order = (layoutApproval: LayoutApproval) => ({ userId: "u", status: "paid" as const, layoutApproval });
    for (const file of ["block", "cover", "layout", "spec"] as const) {
      expect(canDownloadFile(order(pending), { printed: true }, file, staff, same)).toBe("layoutNotApproved");
      expect(canDownloadFile(order(approved), { printed: true }, file, staff, same)).toBe("staff");
      expect(canDownloadFile(order(approved), { printed: true }, file, staff, { fingerprint: "fp-b", bookOpen: false })).toBe("layoutChanged");
    }
    expect(canDownloadFile(order(pending), { printed: true }, "reading", staff, same)).toBe("staff");
    // Книгу сейчас не передали — печатные файлы заказа с согласованием закрыты.
    expect(canDownloadFile(order(approved), { printed: true }, "block", staff)).toBe("layoutChanged");
    // Электронный тариф: покупатель качает файлы, как раньше.
    expect(canDownloadFile(order(none), { printed: false }, "block", { userId: "u", can: () => false })).toBe("owner");
  });
});

describe("заказ: согласование клиентом, сброс при правках, печать", () => {
  it("печатный заказ ждёт согласования; клиент согласует свой — версия книги, журнал, событие; повтор — без записи", async () => {
    const { place, svc, uow, orders, books } = setup();
    const o = await place();
    expect(o.layoutApproval).toMatchObject({ required: true, approvedAt: null });
    await svc.changeStatus({ orderId: o.id, to: "paid" }, admin);
    await expect(svc.approveLayout(o.id, "user-2")).rejects.toMatchObject({ code: "orderNotFound" });
    books.books.get("book-1")!.fp = "fp-v1";
    const done = await svc.approveLayout(o.id, "user-1");
    expect(done.layoutApproval).toMatchObject({ required: true, fingerprint: "fp-v1", revokedAt: null });
    expect(orders.history.at(-1)!.note).toContain("Клиент согласовал макет (версия fp-v1)");
    expect(uow.types()).toContain("ordering.layout_approved");
    const notes = orders.history.length;
    await svc.approveLayout(o.id, "user-1");
    expect(orders.history.length).toBe(notes);
  });

  it("в печать — только согласованный макет; книгу изменили после согласования — отказ «изменён после согласования»", async () => {
    const { place, svc, books } = setup();
    const o = await place();
    await svc.changeStatus({ orderId: o.id, to: "paid" }, admin);
    await expect(svc.changeStatus({ orderId: o.id, to: "in_production" }, admin)).rejects.toMatchObject({ code: "layoutNotApproved" });
    await svc.approveLayout(o.id, "user-1");
    books.books.get("book-1")!.fp = "fp-changed";
    await expect(svc.update({ orderId: o.id, status: "in_production" }, admin)).rejects.toMatchObject({ code: "layoutChanged" });
    books.books.get("book-1")!.fp = undefined;
    await svc.update({ orderId: o.id, status: "in_production" }, admin);
    expect((await svc.findByNumber(o.number))!.status).toBe("in_production");
  });

  it("«Открыть для правок»: согласие сброшено сразу; пока открыта — согласовать нельзя; закрыли без правок — всё равно согласовать заново", async () => {
    const { place, svc, orders } = setup();
    const o = await place();
    await svc.changeStatus({ orderId: o.id, to: "paid" }, admin);
    await svc.approveLayout(o.id, "user-1");
    await svc.toggleBookEditing(o.id, admin);
    let fresh = (await orders.findById(o.id))!;
    expect(fresh.layoutApproval).toMatchObject({ approvedAt: null, fingerprint: null });
    expect(orders.history.at(-1)!.note).toBe("Согласование макета сброшено: книга открыта для правок — клиент должен согласовать заново");
    await expect(svc.approveLayout(o.id, "user-1")).rejects.toMatchObject({ code: "layoutBookEditing" });
    // Закрыли, ничего не поменяв: отпечаток тот же, а согласия нет — в печать нельзя.
    await svc.toggleBookEditing(o.id, admin);
    fresh = (await orders.findById(o.id))!;
    expect(layoutApprovalState(fresh.layoutApproval, { fingerprint: "fp-book-1", bookOpen: false })).toEqual({ state: "pending", again: true });
    await expect(svc.changeStatus({ orderId: o.id, to: "in_production" }, admin)).rejects.toMatchObject({ code: "layoutNotApproved" });
    await svc.approveLayout(o.id, "user-1");
    expect(orders.history.at(-1)!.note).toContain("согласовал макет повторно");
    await svc.changeStatus({ orderId: o.id, to: "in_production" }, admin);
  });

  it("электронный тариф: согласование не нужно и не предлагается; перевели в печатную — нужно", async () => {
    const { place, svc, orders } = setup();
    const o = await place({ plan: "digital", delivery: { method: null, city: null, address: null, postalCode: null } });
    expect(o.layoutApproval.required).toBe(false);
    await svc.changeStatus({ orderId: o.id, to: "paid" }, admin);
    await expect(svc.approveLayout(o.id, "user-1")).rejects.toMatchObject({ code: "layoutNotNeeded" });
    // Перевод в печатную (денег хватает): печатному заказу до печати согласование нужно.
    const { id, ...props } = (await orders.findById(o.id))!.snapshot();
    const upgraded = Order.restore(id, { ...props, receivedAmount: 1_000_000 });
    upgraded.upgradeToPrinted({ plan: "hardcover", discount: null, planName: (p) => p }, "admin", new Date());
    expect(upgraded.layoutApproval.required).toBe(true);
  });

  it("отправленный или отменённый заказ согласовать нельзя", async () => {
    const { place, svc } = setup();
    const o = await place();
    await svc.changeStatus({ orderId: o.id, to: "cancelled" }, admin);
    await expect(svc.approveLayout(o.id, "user-1")).rejects.toMatchObject({ code: "layoutNotNeeded" });
  });
});

describe("пакет для типографии: из согласованной версии", () => {
  it("пакет собран из другой версии (при оплате, до правок) — пересобирается; та же — из кэша", async () => {
    const t = production();
    await t.printFiles.prepare(job);
    expect(t.files.text("orders/o1/package.fp")).toBe("fp1");
    // Клиент поправил книгу и согласовал новую версию: прежний пакет не подходит.
    t.renderer.books.set("b1", { fingerprint: "fp2" });
    const spec = await t.printFiles.prepare(job, { fingerprint: "fp2" });
    expect(spec?.fingerprint).toBe("fp2");
    expect(t.renderer.calls.filter((c) => c.startsWith("package"))).toHaveLength(2);
    expect(await t.printFiles.prepare(job, { fingerprint: "fp2" })).toBeNull();
    expect(t.renderer.calls.filter((c) => c.startsWith("package"))).toHaveLength(2);
  });

  it("книга изменилась, пока пакет ждал сборки, — ошибка, а не пакет несогласованной версии", async () => {
    const t = production();
    await expect(t.printFiles.prepare(job, { fingerprint: "fp-approved" })).rejects.toSatisfy((e) => PrintLayoutChangedError.is(e));
  });

  it("PDF для чтения просят из текущей версии — собранный из прежней пересобирается", async () => {
    const t = production();
    await t.printFiles.getFile(job, "reading", { fingerprint: "fp1" });
    await t.printFiles.getFile(job, "reading", { fingerprint: "fp1" });
    expect(t.renderer.calls.filter((c) => c.startsWith("reading"))).toHaveLength(1);
    await t.printFiles.getFile(job, "reading", { fingerprint: "fp2" });
    expect(t.renderer.calls.filter((c) => c.startsWith("reading"))).toHaveLength(2);
  });
});

describe("printFingerprint: версия книги для печати", () => {
  beforeAll(() => vi.useFakeTimers({ toFake: ["Date"] }));
  beforeEach(() => vi.setSystemTime(new Date("2026-06-15T12:00:00Z")));
  afterAll(() => vi.useRealTimers());

  const bundle = () => fixtureBook("photobook", "a5", "ru").bundle;
  const withBook = (patch: Partial<Book>): BookBundle => {
    const b = bundle();
    return { ...b, book: { ...b.book, ...patch } };
  };
  const withPhoto = (patch: Partial<Photo>): BookBundle => {
    const b = bundle();
    return { ...b, photos: b.photos.map((p, i) => (i === 0 ? { ...p, ...patch } : p)) };
  };

  it("меняется от всего, что на обложке и обороте (contentFingerprint этого не видит)", () => {
    const base = printFingerprint(bundle());
    const changes: Record<string, BookBundle> = {
      "имена на обложке": withBook({ namesOnCover: "Айжан и Марат" }),
      "скрыть получателя": withBook({ hideRecipientOnCover: true }),
      "получатель": withBook({ recipientName: "Другой" }),
      "название": withBook({ title: "Другое название" }),
      "подзаголовок": withBook({ subtitle: "Другой подзаголовок" }),
      "шаблон обложки": withBook({ coverTemplate: "kraft" }),
      "конструктор обложки": withBook({ coverDesign: { layers: [] } }),
      "оборот": withBook({ coverBack: { layout: "text" } }),
      "текст оборота": withBook({ backText: "Другой текст" }),
      "кадр фото обложки": withBook({ photoFrames: { front: { zoom: 2, x: 0.1, y: 0.2 } } }),
      "кадр фото": withPhoto({ crop: { x: 0.3, y: 0.3, zoom: 1.5 } }),
      "правка фото (новый файл)": withPhoto({ storageKey: "photos/b/edited.jpg" }),
    };
    for (const [name, b] of Object.entries(changes)) expect(printFingerprint(b), name).not.toBe(base);
  });

  it("не меняется от служебного: статус книги (открыта/закрыта), время правки, приглашение близких, год", () => {
    const base = printFingerprint(bundle());
    expect(printFingerprint(withBook({ status: "ordered" }))).toBe(base);
    expect(printFingerprint(withBook({ status: "draft" }))).toBe(base);
    expect(printFingerprint(withBook({ updatedAt: new Date("2030-01-01") }))).toBe(base);
    expect(printFingerprint(withBook({ inviteText: "Напишите письмо" }))).toBe(base);
    expect(printFingerprint(withPhoto({ updatedAt: new Date("2030-01-01") }))).toBe(base);
    vi.setSystemTime(new Date("2027-01-02T12:00:00Z"));
    expect(printFingerprint(bundle())).toBe(base);
  });
});
