import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthoringError, Letter, Photo } from "@/modules/authoring/domain";
import { BooksService, LettersService, PhotosService, QuestionsService } from "@/modules/authoring/application/services";
import { FakeUow, ids, images, MemBooks, MemFiles, MemLetters, MemPhotos, noQuestions, now, owner, staff, startBook, stranger, themes } from "./doubles/authoring";
import { anna, client, fake, olga, owner as boss, pavel, person, request, resetContainer, resetRequest, security, signIn, withTwoFactor } from "./doubles/web";

// ─── книга: сервисы Authoring ──────────────────────────────────────────────

async function bookSetup() {
  const books = new MemBooks();
  const book = startBook();
  await books.add(book);
  const photos = new MemPhotos();
  await photos.add(Photo.uploaded("p1", { bookId: "b1", position: 0, storageKey: "photos/b1/p1.jpg", thumbKey: "photos/b1/p1_thumb.jpg", width: 3000, height: 2000 }));
  const letters = new MemLetters();
  await letters.add(Letter.submit("l1", { bookId: "b1", authorName: "Мама", relation: "", text: "Горжусь тобой" }));
  const files = new MemFiles();
  await files.put("photos/b1/p1.jpg", Buffer.from("full"));
  const uow = new FakeUow();
  return {
    book,
    state: () => JSON.stringify([book.snapshot(), photos.rows.map((p) => p.snapshot()), letters.rows.map((l) => l.snapshot()), [...files.data.keys()]]),
    books: new BooksService(books, noQuestions, themes, { bookHasOrders: async () => false }, files, ids, uow, { now: () => now }),
    questions: new QuestionsService(books, noQuestions, uow),
    photos: new PhotosService(books, photos, noQuestions, images, files, ids),
    photoRepo: photos,
    letters: new LettersService(books, letters, ids, uow),
  };
}

const errorCode = (p: Promise<unknown>) => p.then(
  () => "ok",
  (e: unknown) => (AuthoringError.is(e) ? e.code : String(e)),
);

describe("Доступ к чужой книге", () => {
  it("чужой не правит книгу, вопросы, фото и письма: везде «книга не найдена», данные не меняются", async () => {
    const t = await bookSetup();
    const before = t.state();
    const file = { name: "x.jpg", size: 5, bytes: async () => Buffer.from("image") };
    const attempts: Record<string, () => Promise<unknown>> = {
      settings: () => t.books.updateSettings("b1", stranger, { title: "Чужое" }, t.photoRepo),
      invite: () => t.books.setLetterInvite("b1", stranger, true, false),
      deleteBook: () => t.books.delete("b1", stranger),
      answer: () => t.questions.edit("b1", stranger, "q1", { answer: "Чужой ответ" }),
      addQuestion: () => t.questions.addCustom("b1", stranger, "q1", "Свой вопрос"),
      deleteQuestion: () => t.questions.deleteCustom("b1", stranger, "q1"),
      upload: () => t.photos.upload("b1", stranger, [file]),
      photo: () => t.photos.update("b1", stranger, "p1", { caption: "Чужая подпись" }),
      deletePhoto: () => t.photos.delete("b1", stranger, "p1"),
      reorder: () => t.photos.reorder("b1", stranger, ["p1"]),
      rotate: () => t.photos.rotate("b1", stranger, "p1"),
      letter: () => t.letters.edit("b1", stranger, "l1", { status: "approved" }),
      deleteLetter: () => t.letters.delete("b1", stranger, "l1"),
    };
    const codes: Record<string, string> = {};
    for (const [name, attempt] of Object.entries(attempts)) codes[name] = await errorCode(attempt());
    expect(codes).toEqual(Object.fromEntries(Object.keys(attempts).map((name) => [name, "bookNotFound"])));
    expect(t.state()).toBe(before);
  });

  it("V1: так сейчас — книгу клиента правит владелец и любой сотрудник, без прав CRM (закроет E6)", async () => {
    const t = await bookSetup();
    await t.books.updateSettings("b1", owner, { title: "Своё" }, t.photoRepo);
    expect(t.book.title).toBe("Своё");
    await t.books.updateSettings("b1", staff, { title: "Правка сотрудника" }, t.photoRepo);
    expect(t.book.title).toBe("Правка сотрудника");
  });
});

// ─── файлы заказа: роут /api/orders/[id]/files/[kind] ──────────────────────

// Двойники веб-слоя (S6): вход, роли через настоящий StaffResolver, белый список IP и 2FA; подменены только
// заказы и сборка файлов. Проверки доступа настоящие — из роута, api(), getStaff() и can().
vi.mock("next/headers", async () => (await import("./doubles/web")).nextHeaders);
vi.mock("next/navigation", async () => (await import("./doubles/web")).nextNavigation);
vi.mock("@/server/container", async () => (await import("./doubles/web")).containerModule);

const OFFICE = "10.1.2.0/24";
const orders = new Map<string, { id: string; number: number; userId: string; bookId: string; status: string; plan: string }>();
let built: { kind: string; force: boolean }[] = [];

async function download(kind: string, query = "") {
  const { GET } = await import("@/app/api/orders/[id]/files/[kind]/route");
  const res = await GET(new Request(`http://localhost/api/orders/o1/files/${kind}${query}`), { params: Promise.resolve({ id: "o1", kind }) });
  const type = res.headers.get("content-type") ?? "";
  return { status: res.status, body: type.includes("json") ? ((await res.json()) as { code?: string }).code : await res.text(), name: res.headers.get("content-disposition") };
}

describe("Доступ к файлам чужого заказа", () => {
  const order = (status: string, plan: string) => orders.set("o1", { id: "o1", number: 101, userId: client.id, bookId: "b1", status, plan });
  beforeEach(() => {
    resetRequest({ "x-real-ip": "10.1.2.5" });
    resetContainer();
    orders.clear();
    built = [];
    fake.ordering = { queries: { orderDetails: async (id: string) => orders.get(id) ?? null } };
    fake.printFiles = {
      getFile: async (_job: unknown, kind: string, opts: { force: boolean }) => {
        built.push({ kind, force: opts.force });
        return Buffer.from(`file:${kind}`);
      },
    };
    signIn(client);
  });

  it("чужой клиент получает 404 на любой файл оплаченного заказа, файлы не собираются", async () => {
    order("paid", "digital");
    signIn(person("u2"));
    for (const kind of ["reading", "block", "cover", "layout", "spec"]) expect(await download(kind)).toMatchObject({ status: 404, body: "orderNotFound" });
    expect(built).toEqual([]);
  });

  it("владелец: до оплаты — 403; после — читательская версия; файлы типографии — только в электронном тарифе", async () => {
    order("pending_payment", "hardcover");
    expect(await download("reading")).toMatchObject({ status: 403, body: "fileNotReady" });
    order("paid", "hardcover");
    expect(await download("reading")).toEqual({ status: 200, body: "file:reading", name: 'attachment; filename="mybook-101.pdf"' });
    expect(await download("block")).toMatchObject({ status: 403, body: "fileNotReady" });
    order("paid", "digital");
    expect(await download("block")).toMatchObject({ status: 200, body: "file:block" });
    expect(built).toEqual([
      { kind: "reading", force: false },
      { kind: "block", force: false },
    ]);
  });

  it("сотрудник: читательская — по orders.view, файлы типографии — только с orders.files; без прав — 404; пересборка — только сотруднику", async () => {
    order("paid", "hardcover");
    signIn(olga);
    expect(await download("reading", "?regenerate=1")).toMatchObject({ status: 200, body: "file:reading" });
    expect(await download("block")).toMatchObject({ status: 404, body: "orderNotFound" });
    signIn(pavel);
    expect(await download("block", "?regenerate=1")).toMatchObject({ status: 200, body: "file:block" });
    signIn(anna);
    expect(await download("reading")).toMatchObject({ status: 404, body: "orderNotFound" });
    signIn(client);
    await download("reading", "?regenerate=1");
    expect(built.map((b) => b.force)).toEqual([true, true, false]);
  });

  it("сотрудник с правами, но не из разрешённой сети или без обязательной 2FA — как чужой клиент: 404, файлы не собираются", async () => {
    order("paid", "digital");
    security.allowlist = OFFICE;
    request.headers.set("x-real-ip", "8.8.8.8");
    for (const who of [pavel, boss]) {
      signIn(who);
      for (const kind of ["reading", "block"]) expect(await download(kind)).toMatchObject({ status: 404, body: "orderNotFound" });
    }
    request.headers.set("x-real-ip", "10.1.2.77");
    security.require2fa = true;
    signIn(pavel);
    expect(await download("block")).toMatchObject({ status: 404, body: "orderNotFound" });
    expect(built).toEqual([]);
    signIn({ ...pavel, ...withTwoFactor });
    expect(await download("block", "?regenerate=1")).toMatchObject({ status: 200, body: "file:block" });
    expect(built).toEqual([{ kind: "block", force: true }]);
  });

  it("без входа — 401, неизвестный вид файла — 404", async () => {
    order("paid", "digital");
    expect(await download("archive")).toMatchObject({ status: 404, body: "notFound" });
    resetRequest();
    expect(await download("reading")).toMatchObject({ status: 401, body: "unauthorized" });
  });
});
