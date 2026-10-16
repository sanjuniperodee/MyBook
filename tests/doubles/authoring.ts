import { expect } from "vitest";
import type { UnitOfWork } from "@/shared/application";
import type { AggregateRoot, DomainEvent } from "@/shared/domain";
import { AuthoringError, Book, Letter, Photo, type BookRepository, type LetterRepository, type PhotoRepository, type QuestionRepository, type ThemeOnLanguage } from "@/modules/authoring/domain";
import type { FileStore, IdGenerator, ImageProcessor, ThemeCatalog } from "@/modules/authoring/application/ports";

// Двойники для тестов Authoring: книга, вопросы, фото, письма и файлы в памяти.

export const now = new Date("2026-10-01T10:00:00Z");
export const owner = { userId: "u1", isStaff: false, staffEdits: false };
export const stranger = { userId: "u2", isStaff: false, staffEdits: false };
export const staff = { userId: "admin", isStaff: true, staffEdits: true };

export const theme = (lang: "ru" | "kk"): ThemeOnLanguage => ({
  id: "love",
  titleSuggestions: lang === "ru" ? ["Ты — моё всё", "Наша история"] : ["Сен — менің бәрім", "Біздің тарих"],
  defaultCover: "linen",
  defaultInterior: "classic",
  questions: [{ chapter: "meet", key: "q1", prompt: lang === "ru" ? "Как вы познакомились?" : "Қалай таныстыңдар?", title: "", hint: null }],
});

export const startBook = (input: Partial<Parameters<typeof Book.start>[1]> = {}) =>
  Book.start("b1", { userId: "u1", language: "ru", authorName: " Алия ", authorGender: "f", recipientName: "Марат", recipientGender: "m", ...input }, theme("ru"), now).book;

export class FakeUow implements UnitOfWork {
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

export class MemBooks implements BookRepository {
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

export const noQuestions: QuestionRepository = {
  findInBook: async () => null,
  count: async () => 0,
  insertAfter: async () => "q",
  save: async () => {},
  deleteCustom: async () => false,
  replaceTemplates: async () => {},
};

export class MemPhotos implements PhotoRepository {
  rows: Photo[] = [];
  findInBook = async (_b: string, id: string) => this.rows.find((p) => p.id === id) ?? null;
  stats = async () => ({ count: this.rows.length, maxPosition: this.rows.length - 1 });
  belongToBook = async (_b: string, ids: string[]) => ids.every((id) => this.rows.some((p) => p.id === id));
  add = async (p: Photo) => void this.rows.push(p);
  save = async () => {};
  delete = async (p: Photo) => void (this.rows = this.rows.filter((x) => x.id !== p.id));
  reorder = async () => {};
}

export class MemLetters implements LetterRepository {
  rows: Letter[] = [];
  findInBook = async (_b: string, id: string) => this.rows.find((l) => l.id === id) ?? null;
  count = async () => this.rows.length;
  add = async (l: Letter) => void this.rows.push(l);
  save = async () => {};
  delete = async () => true;
}

export class MemFiles implements FileStore {
  data = new Map<string, Buffer>();
  get = async (k: string) => this.data.get(k) ?? Buffer.alloc(0);
  put = async (k: string, d: Buffer) => void this.data.set(k, d);
  delete = async (k: string) => void this.data.delete(k);
  deletePrefix = async (p: string) => [...this.data.keys()].filter((k) => k.startsWith(p)).forEach((k) => this.data.delete(k));
}

let seq = 0;
export const ids: IdGenerator = { uuid: () => `id-${++seq}`, inviteToken: () => `token-${++seq}-abcdefgh`, revision: () => `r${++seq}` };
export const themes: ThemeCatalog = { get: (_id, lang) => theme(lang === "kk" ? "kk" : "ru"), isTheme: (id) => id === "love" };
export const images: ImageProcessor = {
  maxUploadBytes: 100,
  async process(input) {
    if (input.toString() === "broken") throw new Error("unsupported image");
    return { full: input, thumb: input, width: 3000, height: 2000 };
  },
  rotate: async (full, thumb) => ({ full, thumb }),
};

export async function rejectsWith(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(AuthoringError.is(err) && err.code).toBe(code);
}
