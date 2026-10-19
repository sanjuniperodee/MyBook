import { expect } from "vitest";
import type { UnitOfWork } from "@/shared/application";
import type { AnswerMedia } from "@/shared/infrastructure/db/schema";
import type { AggregateRoot, DomainEvent } from "@/shared/domain";
import { countWords } from "@/lib/book/layout";
import {
  AuthoringError,
  Book,
  CUSTOM_QUESTION,
  Letter,
  Photo,
  Question,
  type BookRepository,
  type ChapterRepository,
  type ChapterSeed,
  type LetterRepository,
  type Outline,
  type PhotoRepository,
  type QuestionRepository,
  type QuestionTemplate,
  type SectionOrder,
  type ThemeOnLanguage,
} from "@/modules/authoring/domain";
import type { FileStore, IdGenerator, ImageProcessor, ThemeCatalog } from "@/modules/authoring/application/ports";

// Двойники для тестов Authoring: книга, вопросы, главы, фото, письма и файлы в памяти.

export const now = new Date("2026-10-01T10:00:00Z");
export const owner = { userId: "u1", isStaff: false, staffEdits: false };
export const stranger = { userId: "u2", isStaff: false, staffEdits: false };
export const staff = { userId: "admin", isStaff: true, staffEdits: true };
/** Сотрудник с правом только на просмотр (clients.view без clients.edit). */
export const viewOnlyStaff = { userId: "viewer", isStaff: true, staffEdits: false };

export const theme = (lang: "ru" | "kk"): ThemeOnLanguage => ({
  id: "love",
  kind: "gift",
  recipient: "required",
  titleSuggestions: lang === "ru" ? ["Ты — моё всё", "Наша история"] : ["Сен — менің бәрім", "Біздің тарих"],
  firstChapterTitle: "",
  defaultCover: "linen",
  defaultInterior: "classic",
  questions: [{ chapter: "meet", key: "q1", prompt: lang === "ru" ? "Как вы познакомились?" : "Қалай таныстыңдар?", title: "", hint: null }],
});

/** Автобиография: получателя нет, вопрос — рассказчику. */
export const autobiographyTheme = (lang: "ru" | "kk"): ThemeOnLanguage => ({
  id: "autobiography",
  kind: "autobiography",
  recipient: "none",
  titleSuggestions: lang === "ru" ? ["История моей жизни", "Моя жизнь"] : ["Менің өмірімнің тарихы", "Менің өмірім"],
  firstChapterTitle: "",
  defaultCover: "leather",
  defaultInterior: "vintage",
  questions: [{ chapter: "childhood", key: "autobiography.childhood.1", prompt: "Где вы родились?", title: "Где я {родился|родилась}", hint: null }],
});

/** Своя книга: банка нет, первая глава по умолчанию — «Начало» / «Бастау». */
export const blankTheme = (lang: "ru" | "kk"): ThemeOnLanguage => ({
  id: "blank",
  kind: "blank",
  recipient: "optional",
  titleSuggestions: lang === "ru" ? ["Моя книга", "Записки"] : ["Менің кітабым", "Жазбалар"],
  firstChapterTitle: lang === "ru" ? "Начало" : "Бастау",
  defaultCover: "linen",
  defaultInterior: "classic",
  questions: [],
});

const catalog: Record<string, (lang: "ru" | "kk") => ThemeOnLanguage> = { love: theme, autobiography: autobiographyTheme, blank: blankTheme };

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
  /** Вопросы и главы, с которыми создавались книги (add). */
  added = new Map<string, { questions: readonly QuestionTemplate[]; chapters: readonly ChapterSeed[] }>();
  /** Сколько раз книгу брали с блокировкой строки. */
  locks = 0;
  nextId = () => "b1";
  findById = async (id: string, opts?: { lock?: boolean }) => {
    if (opts?.lock) this.locks++;
    return this.rows.get(id) ?? null;
  };
  findByInviteToken = async (token: string) => [...this.rows.values()].find((b) => b.inviteToken === token) ?? null;
  add = async (b: Book, questions: readonly QuestionTemplate[] = [], chapters: readonly ChapterSeed[] = []) => {
    this.rows.set(b.id, b);
    this.added.set(b.id, { questions, chapters });
  };
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
  insertSection: async () => "q",
  sections: async () => [],
  arrange: async () => {},
  renumber: async () => {},
  save: async () => {},
  deleteCustom: async () => false,
  deleteChapter: async () => ({ ids: [], hadText: false }),
  idsInChapter: async () => [],
  wordsInBook: async () => 0,
  replaceTemplates: async () => {},
};

/** Главы, которых нет (книги с банком). */
export const noChapters: ChapterRepository = {
  list: async () => [],
  add: async () => {},
  update: async () => false,
  delete: async () => false,
  setOrder: async () => {},
  retitle: async () => {},
  outline: async () => ({ chapters: [], sections: [] }),
};

/** Строка book_questions в памяти. */
export interface MemQuestionRow {
  id: string;
  bookId: string;
  chapter: string;
  key: string | null;
  position: number;
  /** Порядок создания — как created_at в перенумерации. */
  seq: number;
  prompt: string;
  title: string;
  hint: string | null;
  answer: string;
  displayText: string | null;
  hideHeading: boolean;
  media: AnswerMedia[];
}

/** Строка book_chapters в памяти. */
export interface MemChapterRow {
  bookId: string;
  key: string;
  title: string;
  epigraph: string;
  position: number;
  seq: number;
}

type SeedSection = string | { answer?: string; key?: string | null; title?: string };

/**
 * Вопросы и главы книги в памяти — с той же перенумерацией, что SQL репозитория: у своей книги — по позициям глав
 * (разделы пропавших глав — в конце), внутри главы — по месту и порядку создания; у книг с банком — по месту.
 */
export class MemOutline implements QuestionRepository, ChapterRepository {
  questions: MemQuestionRow[] = [];
  chapterRows: MemChapterRow[] = [];
  private seq = 0;
  private qid = 0;

  constructor(private readonly userId = "u1") {}

  /** Заполнить книгу: главы (key, название) с разделами — строка ответа или поля раздела. */
  seed(bookId: string, chapters: { key: string; title?: string; sections: SeedSection[] }[]) {
    chapters.forEach((c, i) => {
      this.chapterRows.push({ bookId, key: c.key, title: c.title ?? "", epigraph: "", position: i, seq: this.seq++ });
      for (const s of c.sections) {
        const o = typeof s === "string" ? { answer: s } : s;
        this.questions.push({
          id: `s${++this.qid}`,
          bookId,
          chapter: c.key,
          key: o.key === undefined ? CUSTOM_QUESTION : o.key,
          position: this.questions.filter((q) => q.bookId === bookId).length,
          seq: this.seq++,
          prompt: "",
          title: o.title ?? "",
          hint: null,
          answer: o.answer ?? "",
          displayText: null,
          hideHeading: false,
          media: [],
        });
      }
    });
    return this;
  }

  /** Разделы книги по позициям. */
  of(bookId: string) {
    return this.questions.filter((q) => q.bookId === bookId).sort((a, b) => a.position - b.position);
  }

  // ─── QuestionRepository ──────────────────────────────────────────────────
  findInBook = async (bookId: string, id: string) => {
    const r = this.questions.find((q) => q.id === id && q.bookId === bookId);
    return r ? Question.restore(r.id, { bookId, userId: this.userId, position: r.position, chapter: r.chapter, key: r.key, prompt: r.prompt, title: r.title, hint: r.hint, answer: r.answer, displayText: r.displayText, hideHeading: r.hideHeading, media: r.media }) : null;
  };
  count = async (bookId: string) => this.questions.filter((q) => q.bookId === bookId).length;
  private shiftAfter(after: Question) {
    for (const q of this.questions) if (q.bookId === after.bookId && q.position > after.position) q.position++;
  }
  private insert(bookId: string, chapter: string, position: number, texts: { title: string; prompt: string }) {
    const id = `s${++this.qid}`;
    this.questions.push({ id, bookId, chapter, key: CUSTOM_QUESTION, position, seq: this.seq++, prompt: texts.prompt, title: texts.title, hint: null, answer: "", displayText: null, hideHeading: false, media: [] });
    return id;
  }
  insertAfter = async (after: Question, prompt: string) => {
    this.shiftAfter(after);
    const id = this.insert(after.bookId, after.chapter, after.position + 1, { title: prompt, prompt });
    await this.renumber(after.bookId, "bank");
    return id;
  };
  insertSection = async (bookId: string, chapter: string, after: Question | null, texts: { title: string; prompt: string }) => {
    if (after) this.shiftAfter(after);
    return this.insert(bookId, chapter, after ? after.position + 1 : 2_000_000_000, texts);
  };
  sections = async (bookId: string) => this.of(bookId).map(({ id, chapter, position }) => ({ id, chapter, position }));
  arrange = async (bookId: string, order: readonly { id: string; chapter: string }[]) => {
    order.forEach((s, i) => {
      const q = this.questions.find((x) => x.id === s.id && x.bookId === bookId);
      if (q) Object.assign(q, { chapter: s.chapter, position: i });
    });
  };
  renumber = async (bookId: string, order: SectionOrder) => {
    const pos = new Map(this.chapterRows.filter((c) => c.bookId === bookId).map((c) => [c.key, c.position]));
    const cmp = (a: MemQuestionRow, b: MemQuestionRow) => {
      if (order === "outline") {
        const ca = pos.get(a.chapter) ?? Infinity;
        const cb = pos.get(b.chapter) ?? Infinity;
        if (ca !== cb) return ca - cb;
        if (a.chapter !== b.chapter) return a.chapter < b.chapter ? -1 : 1;
      }
      return a.position - b.position || a.seq - b.seq;
    };
    this.questions
      .filter((q) => q.bookId === bookId)
      .sort(cmp)
      .forEach((q, i) => (q.position = i));
  };
  save = async (question: Question) => {
    const s = question.snapshot();
    const q = this.questions.find((x) => x.id === question.id);
    if (q) Object.assign(q, { answer: s.answer, media: s.media, displayText: s.displayText, hideHeading: s.hideHeading, prompt: s.prompt, title: s.title });
  };
  deleteCustom = async (bookId: string, id: string) => {
    const before = this.questions.length;
    this.questions = this.questions.filter((q) => !(q.id === id && q.bookId === bookId && q.key === CUSTOM_QUESTION));
    return this.questions.length < before;
  };
  deleteChapter = async (bookId: string, chapter: string) => {
    const gone = this.questions.filter((q) => q.bookId === bookId && q.chapter === chapter);
    this.questions = this.questions.filter((q) => !gone.includes(q));
    return { ids: gone.map((q) => q.id), hadText: gone.some((q) => !!q.answer.trim()) };
  };
  idsInChapter = async (bookId: string, chapter: string) => this.questions.filter((q) => q.bookId === bookId && q.chapter === chapter).map((q) => q.id);
  wordsInBook = async (bookId: string) => this.questions.filter((q) => q.bookId === bookId).reduce((s, q) => s + countWords(q.answer), 0);
  replaceTemplates = async (bookId: string, byKey: ReadonlyMap<string, { prompt: string; title: string; hint: string | null }>) => {
    for (const q of this.questions) if (q.bookId === bookId && q.key && byKey.has(q.key)) Object.assign(q, byKey.get(q.key));
  };

  // ─── ChapterRepository ───────────────────────────────────────────────────
  list = async (bookId: string) =>
    this.chapterRows
      .filter((c) => c.bookId === bookId)
      .sort((a, b) => a.position - b.position || a.seq - b.seq)
      .map(({ key, title, epigraph, position }) => ({ key, title, epigraph, position }));
  add = async (bookId: string, c: ChapterSeed & { position: number }) => void this.chapterRows.push({ bookId, ...c, seq: this.seq++ });
  update = async (bookId: string, key: string, patch: { title?: string; epigraph?: string }) => {
    const c = this.chapterRows.find((x) => x.bookId === bookId && x.key === key);
    if (c) Object.assign(c, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
    return !!c;
  };
  delete = async (bookId: string, key: string) => {
    const before = this.chapterRows.length;
    this.chapterRows = this.chapterRows.filter((c) => !(c.bookId === bookId && c.key === key));
    return this.chapterRows.length < before;
  };
  setOrder = async (bookId: string, keys: readonly string[]) => {
    for (const c of this.chapterRows) if (c.bookId === bookId && keys.includes(c.key)) c.position = keys.indexOf(c.key);
  };
  retitle = async (bookId: string, from: string, to: string) => {
    for (const c of this.chapterRows) if (c.bookId === bookId && c.title === from) c.title = to;
  };
  outline = async (bookId: string): Promise<Outline> => ({ chapters: await this.list(bookId), sections: await this.sections(bookId) });
}

export class MemPhotos implements PhotoRepository {
  rows: Photo[] = [];
  /** id разделов, от которых отвязывали фото. */
  detached: string[] = [];
  findInBook = async (_b: string, id: string) => this.rows.find((p) => p.id === id) ?? null;
  stats = async () => ({ count: this.rows.length, maxPosition: this.rows.length - 1 });
  belongToBook = async (_b: string, ids: string[]) => ids.every((id) => this.rows.some((p) => p.id === id));
  add = async (p: Photo) => void this.rows.push(p);
  save = async () => {};
  delete = async (p: Photo) => void (this.rows = this.rows.filter((x) => x.id !== p.id));
  reorder = async () => {};
  detachFromQuestions = async (_b: string, questionIds: readonly string[]) => {
    this.detached.push(...questionIds);
    for (const p of this.rows) {
      const q = p.snapshot().questionId;
      if (q && questionIds.includes(q)) p.update({ questionId: null, inline: null });
    }
  };
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
export const themes: ThemeCatalog = { get: (id, lang) => (catalog[id] ?? theme)(lang === "kk" ? "kk" : "ru"), isTheme: (id) => id in catalog };
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
