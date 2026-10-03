import { describe, expect, it } from "vitest";
import type { UnitOfWork } from "@/shared/application";
import type { AggregateRoot, DomainEvent } from "@/shared/domain";
import { AuthoringError, Book, Letter, Photo, Question, type BookRepository, type LetterRepository, type PhotoRepository, type QuestionRepository, type ThemeOnLanguage } from "@/modules/authoring/domain";
import { BooksService, LettersService, PhotosService } from "@/modules/authoring/application/services";
import type { FileStore, IdGenerator, ImageProcessor, ThemeCatalog } from "@/modules/authoring/application/ports";

// ─── тестовые двойники ─────────────────────────────────────────────────────

const now = new Date("2026-10-01T10:00:00Z");
const owner = { userId: "u1", isStaff: false };
const stranger = { userId: "u2", isStaff: false };
const staff = { userId: "admin", isStaff: true };

const theme = (lang: "ru" | "kk"): ThemeOnLanguage => ({
  id: "love",
  titleSuggestions: lang === "ru" ? ["Ты — моё всё", "Наша история"] : ["Сен — менің бәрім", "Біздің тарих"],
  defaultCover: "linen",
  defaultInterior: "classic",
  questions: [{ chapter: "meet", key: "q1", prompt: lang === "ru" ? "Как вы познакомились?" : "Қалай таныстыңдар?", title: "", hint: null }],
});

const startBook = (input: Partial<Parameters<typeof Book.start>[1]> = {}) =>
  Book.start("b1", { userId: "u1", language: "ru", authorName: " Алия ", authorGender: "f", recipientName: "Марат", recipientGender: "m", ...input }, theme("ru"), now).book;

class FakeUow implements UnitOfWork {
  published: DomainEvent[] = [];
  private tracked = new Set<AggregateRoot<object, string | number>>();
  async run<T>(work: () => Promise<T>): Promise<T> {
    try {
      const v = await work();
      for (const a of this.tracked) this.published.push(...a.pullEvents());
      return v;
    } finally {
      this.tracked.clear();
    }
  }
  track(...a: AggregateRoot<object, string | number>[]) {
    a.forEach((x) => this.tracked.add(x));
  }
}

class MemBooks implements BookRepository {
  rows = new Map<string, Book>();
  nextId = () => "b1";
  findById = async (id: string) => this.rows.get(id) ?? null;
  findByInviteToken = async (token: string) => [...this.rows.values()].find((b) => b.inviteToken === token) ?? null;
  add = async (b: Book) => void this.rows.set(b.id, b);
  save = async (b: Book) => void this.rows.set(b.id, b);
  touch = async () => {};
  delete = async (id: string) => void this.rows.delete(id);
  lockForOrder = async () => true;
  setStatus = async () => {};
}

const noQuestions: QuestionRepository = {
  findInBook: async () => null,
  count: async () => 0,
  insertAfter: async () => "q",
  save: async () => {},
  deleteCustom: async () => false,
  replaceTemplates: async () => {},
};

class MemPhotos implements PhotoRepository {
  rows: Photo[] = [];
  findInBook = async (_b: string, id: string) => this.rows.find((p) => p.id === id) ?? null;
  stats = async () => ({ count: this.rows.length, maxPosition: this.rows.length - 1 });
  belongToBook = async (_b: string, ids: string[]) => ids.every((id) => this.rows.some((p) => p.id === id));
  add = async (p: Photo) => void this.rows.push(p);
  save = async () => {};
  delete = async (p: Photo) => void (this.rows = this.rows.filter((x) => x.id !== p.id));
  reorder = async () => {};
}

class MemLetters implements LetterRepository {
  rows: Letter[] = [];
  findInBook = async (_b: string, id: string) => this.rows.find((l) => l.id === id) ?? null;
  count = async () => this.rows.length;
  add = async (l: Letter) => void this.rows.push(l);
  save = async () => {};
  delete = async () => true;
}

class MemFiles implements FileStore {
  data = new Map<string, Buffer>();
  get = async (k: string) => this.data.get(k) ?? Buffer.alloc(0);
  put = async (k: string, d: Buffer) => void this.data.set(k, d);
  delete = async (k: string) => void this.data.delete(k);
  deletePrefix = async (p: string) => [...this.data.keys()].filter((k) => k.startsWith(p)).forEach((k) => this.data.delete(k));
}

let seq = 0;
const ids: IdGenerator = { uuid: () => `id-${++seq}`, inviteToken: () => `token-${++seq}-abcdefgh`, revision: () => `r${++seq}` };
const themes: ThemeCatalog = { get: (_id, lang) => theme(lang === "kk" ? "kk" : "ru"), isTheme: (id) => id === "love" };
const images: ImageProcessor = {
  maxUploadBytes: 100,
  async process(input) {
    if (input.toString() === "broken") throw new Error("unsupported image");
    return { full: input, thumb: input, width: 3000, height: 2000 };
  },
  rotate: async (full, thumb) => ({ full, thumb }),
};

async function rejectsWith(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(AuthoringError.is(err) && err.code).toBe(code);
}

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
    const service = new BooksService(books, noQuestions, themes, { bookHasOrders: async () => hasOrders }, files, ids, uow, { now: () => now });
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
