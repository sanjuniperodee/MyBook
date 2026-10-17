import { describe, expect, it } from "vitest";
import { AuthoringError, Book, isBookVisibleTo, MAX_PHOTOS, Photo, Question } from "@/modules/authoring/domain";
import { BooksService, LettersService, PhotosService } from "@/modules/authoring/application/services";
import { FakeUow, ids, images, MemBooks, MemFiles, MemLetters, MemPhotos, noChapters, noQuestions, now, owner, rejectsWith, staff, startBook, stranger, theme, themes } from "./doubles/authoring";

// ─── домен ─────────────────────────────────────────────────────────────────

describe("Book", () => {
  it("новая книга: черновик, название из предложенных, неизвестный повод отброшен, событие book_started", () => {
    const book = startBook({ occasion: "nope", occasionDate: "2026-12-01" });
    const s = book.snapshot();
    expect(s.status).toBe("draft");
    expect(s.title).toBe("Ты — моё всё");
    expect(s.authorName).toBe("Алия");
    expect(s.occasion).toBeNull();
    expect(s.occasionDate).toBeNull();
    expect(book.pullEvents().map((e) => e.type)).toEqual(["authoring.book_started"]);
  });

  it("настройки проверяются по каталогам обложек, форматов, оформлений и поводов", () => {
    const book = startBook();
    expect(() => book.applySettings({ coverTemplate: "nope" })).toThrow();
    expect(() => book.applySettings({ format: "a0" })).toThrow();
    expect(() => book.applySettings({ interior: "comic" })).toThrow();
    expect(() => book.applySettings({ occasion: "nope" })).toThrow();
    book.applySettings({ format: "square", subtitle: "Четыре года", occasion: "birthday", interior: "oyu" });
    expect(book.snapshot()).toMatchObject({ format: "square", subtitle: "Четыре года", occasion: "birthday", interior: "oyu" });
  });

  it("заказанную книгу менять нельзя", () => {
    const book = Book.restore("b1", { ...startBook().snapshot(), status: "ordered" });
    try {
      book.applySettings({ title: "Новое" });
      expect.unreachable();
    } catch (e) {
      expect(AuthoringError.is(e) && e.code).toBe("bookLocked");
    }
  });

  it("смена языка переводит предложенное название, но не своё", () => {
    const book = startBook();
    const texts = book.switchLanguage("kk", theme("ru"), theme("kk"));
    expect(book.title).toBe("Сен — менің бәрім");
    expect(texts.get("q1")?.prompt).toBe("Қалай таныстыңдар?");

    const custom = startBook({ title: "Моя книга" });
    custom.switchLanguage("kk", theme("ru"), theme("kk"));
    expect(custom.title).toBe("Моя книга");
  });

  it("ссылка для писем: создаётся один раз, перевыпускается по запросу, выключение закрывает приём", () => {
    const book = startBook();
    const t1 = book.setLetterInvite(true, false, () => "aaa");
    expect(book.setLetterInvite(true, false, () => "bbb")).toBe(t1);
    expect(book.setLetterInvite(true, true, () => "ccc")).toBe("ccc");
    book.setLetterInvite(false, false, () => "ddd");
    expect(() => book.assertAcceptsLetters()).toThrow();
  });

  it("видимость: владелец и сотрудник видят, чужой — нет", () => {
    const book = startBook();
    expect(book.isVisibleTo(owner)).toBe(true);
    expect(book.isVisibleTo(staff)).toBe(true);
    expect(book.isVisibleTo(stranger)).toBe(false);
  });

  it("то же правило видимости — для read-моделей по владельцу книги", () => {
    expect(isBookVisibleTo(owner.userId, owner)).toBe(true);
    expect(isBookVisibleTo(owner.userId, staff)).toBe(true);
    expect(isBookVisibleTo(owner.userId, stranger)).toBe(false);
  });
});

describe("Question", () => {
  const q = () => Question.restore("q1", { bookId: "b1", userId: "u1", position: 0, chapter: "meet", key: "q1", prompt: "?", title: "", hint: null, answer: "", displayText: null, hideHeading: false });

  it("событие прогресса — только когда вопрос становится отвеченным или пустым", () => {
    const question = q();
    question.edit({ answer: "Первая строка" });
    question.edit({ answer: "Первая строка, вторая" });
    question.edit({ hideHeading: true });
    question.edit({ answer: "   " });
    expect(question.pullEvents().map((e) => e.type)).toEqual(["authoring.book_progressed", "authoring.book_progressed"]);
  });
});

describe("Photo", () => {
  it("широкий кадр — на полстраницы, поворот меняет размеры, ключи и точку фокуса", () => {
    const photo = Photo.uploaded("p1", { bookId: "b1", position: 0, storageKey: "a.jpg", thumbKey: "a_t.jpg", width: 3000, height: 2000 });
    expect(photo.snapshot().layout).toBe("half");
    photo.update({ inline: { aspect: "landscape", width: "full", focusX: 0.2, focusY: 0.7 } as never });
    const before = photo.snapshot().inline!;
    const prev = photo.rotated({ storageKey: "b.jpg", thumbKey: "b_t.jpg" });
    const s = photo.snapshot();
    expect(prev).toEqual({ storageKey: "a.jpg", thumbKey: "a_t.jpg" });
    expect([s.width, s.height]).toEqual([2000, 3000]);
    expect(s.inline?.focusX).toBeCloseTo(1 - before.focusY);
    expect(s.inline?.focusY).toBeCloseTo(before.focusX);
  });
});

// ─── сценарии ──────────────────────────────────────────────────────────────

describe("BooksService", () => {
  const setup = (hasOrders = false) => {
    const books = new MemBooks();
    const files = new MemFiles();
    const uow = new FakeUow();
    const service = new BooksService(books, noQuestions, themes, { bookHasOrders: async () => hasOrders }, files, ids, uow, { now: () => now }, noChapters);
    return { books, files, uow, service };
  };

  it("создание книги публикует book_started после коммита", async () => {
    const { service, uow, books } = setup();
    const book = await service.start("u1", { theme: "love", language: "ru", authorName: "Алия", authorGender: "f", recipientName: "Марат", recipientGender: "m" });
    expect(books.rows.get(book.id)).toBeDefined();
    expect(uow.published.map((e) => e.type)).toEqual(["authoring.book_started"]);
  });

  it("чужую книгу нельзя ни увидеть, ни удалить", async () => {
    const { service } = setup();
    await service.start("u1", { theme: "love", language: "ru", authorName: "Алия", authorGender: "f", recipientName: "Марат", recipientGender: "m" });
    await rejectsWith(service.delete("b1", stranger), "bookNotFound");
  });

  it("книгу с заказами удалить нельзя; без заказов — удаляются и файлы", async () => {
    const withOrders = setup(true);
    await withOrders.service.start("u1", { theme: "love", language: "ru", authorName: "А", authorGender: "f", recipientName: "М", recipientGender: "m" });
    await rejectsWith(withOrders.service.delete("b1", owner), "bookHasOrders");

    const clean = setup(false);
    await clean.service.start("u1", { theme: "love", language: "ru", authorName: "А", authorGender: "f", recipientName: "М", recipientGender: "m" });
    await clean.files.put("photos/b1/x.jpg", Buffer.from("x"));
    await clean.files.put("cache/preview/b1/f.pdf", Buffer.from("x"));
    await clean.service.delete("b1", owner);
    expect(clean.books.rows.size).toBe(0);
    expect(clean.files.data.size).toBe(0);
  });
});

describe("PhotosService", () => {
  it("загрузка пачкой: большие и битые файлы — в списке ошибок, остальные сохраняются", async () => {
    const books = new MemBooks();
    await books.add(startBook());
    const photos = new MemPhotos();
    const files = new MemFiles();
    const service = new PhotosService(books, photos, noQuestions, images, files, ids);
    const file = (name: string, content: string) => ({ name, size: content.length, bytes: async () => Buffer.from(content) });
    const res = await service.upload("b1", owner, [file("ok.jpg", "image"), file("huge.jpg", "x".repeat(200)), file("bad.heic", "broken")]);
    expect(res.created).toHaveLength(1);
    expect(res.failed).toEqual([
      { name: "huge.jpg", reason: "tooBig" },
      { name: "bad.heic", reason: "format" },
    ]);
    expect(files.data.size).toBe(2);
  });

  it("больше предела за раз — photosLimit с пределом в параметрах: из них собирается текст «до N фото»", async () => {
    const books = new MemBooks();
    await books.add(startBook());
    const service = new PhotosService(books, new MemPhotos(), noQuestions, images, new MemFiles(), ids);
    const many = Array.from({ length: MAX_PHOTOS + 1 }, (_, i) => ({ name: `${i}.jpg`, size: 5, bytes: async () => Buffer.from("image") }));
    const err = await service.upload("b1", owner, many).catch((e: unknown) => e);
    expect(AuthoringError.is(err)).toBe(true);
    expect(err).toMatchObject({ code: "photosLimit", params: [MAX_PHOTOS] });
  });

  it("удалённое фото снимается с обложки", async () => {
    const books = new MemBooks();
    const book = startBook();
    await books.add(book);
    const photos = new MemPhotos();
    await photos.add(Photo.uploaded("p1", { bookId: "b1", position: 0, storageKey: "a", thumbKey: "b", width: 1, height: 1 }));
    book.setCoverPhoto("p1");
    await new PhotosService(books, photos, noQuestions, images, new MemFiles(), ids).delete("b1", owner, "p1");
    expect(book.coverPhotoId).toBeNull();
  });

  it("удалённое фото уходит и с дополнительных мест коллажа и полароидов", async () => {
    const books = new MemBooks();
    const book = startBook();
    await books.add(book);
    const photos = new MemPhotos();
    for (const id of ["p1", "p2"]) await photos.add(Photo.uploaded(id, { bookId: "b1", position: 0, storageKey: id, thumbKey: `${id}t`, width: 1, height: 1 }));
    book.setExtraPhotos("cover", ["p2", "p1"]);
    book.setExtraPhotos("back", ["p2"]);
    await new PhotosService(books, photos, noQuestions, images, new MemFiles(), ids).delete("b1", owner, "p2");
    expect(book.coverPhotoExtra).toEqual(["p1"]);
    expect(book.backPhotoExtra).toEqual([]);
  });
});

describe("LettersService", () => {
  const setup = async (opts: { invite?: boolean; ordered?: boolean } = {}) => {
    const books = new MemBooks();
    const book = Book.restore("b1", { ...startBook().snapshot(), status: opts.ordered ? "ordered" : "draft", inviteToken: opts.invite === false ? null : "invite-token-123" });
    await books.add(book);
    const letters = new MemLetters();
    const uow = new FakeUow();
    return { letters, uow, service: new LettersService(books, letters, ids, uow) };
  };
  const input = { authorName: " Мама ", relation: "мама", text: "Горжусь тобой" };

  it("письмо по ссылке ждёт одобрения и публикует letter_submitted", async () => {
    const { service, letters, uow } = await setup();
    await service.submit("invite-token-123", input);
    expect(letters.rows[0].snapshot()).toMatchObject({ status: "pending", authorName: "Мама" });
    expect(uow.published.map((e) => e.type)).toEqual(["authoring.letter_submitted"]);
  });

  it("неверная, закрытая ссылка и заказанная книга — отказ", async () => {
    await rejectsWith((await setup()).service.submit("bad token!", input), "letterInvalid");
    await rejectsWith((await setup()).service.submit("unknown-token-1", input), "letterClosed");
    await rejectsWith((await setup({ ordered: true })).service.submit("invite-token-123", input), "letterPrinted");
  });
});
