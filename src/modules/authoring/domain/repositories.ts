import type { Book, ChapterSeed, QuestionTemplate } from "./Book";
import type { Letter } from "./Letter";
import type { Outline } from "./outline";
import type { Photo } from "./Photo";
import type { Question } from "./Question";

export interface BookRepository {
  nextId(): string;
  /**
   * lock — строка книги блокируется до конца транзакции (SELECT … FOR UPDATE): операции оглавления и правки, которые
   * проверяют лимиты и набор, идут по одной, а заказ (lockForOrder) ждёт их окончания. Только внутри Unit of Work.
   */
  findById(id: string, opts?: { lock?: boolean }): Promise<Book | null>;
  findByInviteToken(token: string): Promise<Book | null>;
  /** Новая книга вместе с вопросами из банка и главами своей книги (одной транзакцией). */
  add(book: Book, questions: readonly QuestionTemplate[], chapters?: readonly ChapterSeed[]): Promise<void>;
  save(book: Book): Promise<void>;
  /** Отметка «книга изменилась» (сортировка списков, напоминания). */
  touch(bookId: string): Promise<void>;
  delete(bookId: string): Promise<void>;
  /** draft → ordered атомарно (условие в БД); false — книгу уже заказали параллельно. */
  lockForOrder(bookId: string): Promise<boolean>;
  setStatus(bookId: string, status: "draft" | "ordered"): Promise<void>;
}

/** Порядок разделов после операции: у своей книги — по главам в их порядке, у книг с банком — как стоят вопросы. */
export type SectionOrder = "outline" | "bank";

export interface QuestionRepository {
  findInBook(bookId: string, questionId: string): Promise<Question | null>;
  count(bookId: string): Promise<number>;
  /** Вставить свой вопрос сразу после указанного (сдвигая следующие) и перенумеровать. */
  insertAfter(after: Question, prompt: string): Promise<string>;
  /**
   * Новый раздел своей книги в главе: после afterId или (null) в конец главы. Позиции не пересчитывает —
   * после вставки сервис вызывает renumber("outline").
   */
  insertSection(bookId: string, chapter: string, after: Question | null, texts: { title: string; prompt: string }): Promise<string>;
  /** Разделы книги по порядку (id, глава, позиция) — проверка набора при перестановке. */
  sections(bookId: string): Promise<{ id: string; chapter: string; position: number }[]>;
  /** Полный порядок разделов своей книги: глава и место каждого; позиции потом выравнивает renumber("outline"). */
  arrange(bookId: string, order: readonly { id: string; chapter: string }[]): Promise<void>;
  /** Позиции 0..N-1 подряд: у своей книги — по главам (book_chapters.position), потом по месту; у книг с банком — по месту. */
  renumber(bookId: string, order: SectionOrder): Promise<void>;
  save(question: Question): Promise<void>;
  deleteCustom(bookId: string, questionId: string): Promise<boolean>;
  /** Удалить разделы главы; возвращает их id и было ли в них что-то написано. */
  deleteChapter(bookId: string, chapter: string): Promise<{ ids: string[]; hadText: boolean }>;
  /** id разделов главы — фото отвязываются от них до удаления. */
  idsInChapter(bookId: string, chapter: string): Promise<string[]>;
  /** Слов во всех ответах книги (как countWords). */
  wordsInBook(bookId: string): Promise<number>;
  /** Заменить тексты стандартных вопросов (смена языка книги). */
  replaceTemplates(bookId: string, byKey: ReadonlyMap<string, { prompt: string; title: string; hint: string | null }>): Promise<void>;
}

/** Главы своей книги (тема blank) — book_chapters. */
export interface ChapterRepository {
  /** Главы книги по порядку. */
  list(bookId: string): Promise<{ key: string; title: string; epigraph: string; position: number }[]>;
  add(bookId: string, chapter: ChapterSeed & { position: number }): Promise<void>;
  update(bookId: string, key: string, patch: { title?: string; epigraph?: string }): Promise<boolean>;
  delete(bookId: string, key: string): Promise<boolean>;
  /** Полный порядок глав: позиции 0..M-1 по списку ключей (одним запросом). */
  setOrder(bookId: string, keys: readonly string[]): Promise<void>;
  /** Смена языка: главы с названием по умолчанию прежнего языка получают название нового. */
  retitle(bookId: string, from: string, to: string): Promise<void>;
  /** Оглавление книги после операции: главы и разделы по порядку — клиент применяет его как истину. */
  outline(bookId: string): Promise<Outline>;
}

export interface PhotoRepository {
  findInBook(bookId: string, photoId: string): Promise<Photo | null>;
  stats(bookId: string): Promise<{ count: number; maxPosition: number }>;
  belongToBook(bookId: string, ids: string[]): Promise<boolean>;
  add(photo: Photo): Promise<void>;
  save(photo: Photo): Promise<void>;
  delete(photo: Photo): Promise<void>;
  reorder(bookId: string, ids: string[]): Promise<void>;
  /**
   * Раздел удаляется — его фото остаются в книге среди общих (вкладка «Фото»): связь с разделом и оформление
   * «в тексте» сбрасываются в той же транзакции до удаления (FK SET NULL оформление не сбросил бы).
   */
  detachFromQuestions(bookId: string, questionIds: readonly string[]): Promise<void>;
}

export interface LetterRepository {
  findInBook(bookId: string, letterId: string): Promise<Letter | null>;
  count(bookId: string): Promise<number>;
  add(letter: Letter): Promise<void>;
  save(letter: Letter): Promise<void>;
  delete(bookId: string, letterId: string): Promise<boolean>;
}
