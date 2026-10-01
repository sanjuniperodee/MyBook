import type { Book, QuestionTemplate } from "./Book";
import type { Letter } from "./Letter";
import type { Photo } from "./Photo";
import type { Question } from "./Question";

export interface BookRepository {
  nextId(): string;
  findById(id: string): Promise<Book | null>;
  findByInviteToken(token: string): Promise<Book | null>;
  /** Новая книга вместе с вопросами из банка (одной транзакцией). */
  add(book: Book, questions: readonly QuestionTemplate[]): Promise<void>;
  save(book: Book): Promise<void>;
  /** Отметка «книга изменилась» (сортировка списков, напоминания). */
  touch(bookId: string): Promise<void>;
  delete(bookId: string): Promise<void>;
  /** draft → ordered атомарно (условие в БД); false — книгу уже заказали параллельно. */
  lockForOrder(bookId: string): Promise<boolean>;
  setStatus(bookId: string, status: "draft" | "ordered"): Promise<void>;
}

export interface QuestionRepository {
  findInBook(bookId: string, questionId: string): Promise<Question | null>;
  count(bookId: string): Promise<number>;
  /** Вставить свой вопрос сразу после указанного (сдвигая следующие) и перенумеровать. */
  insertAfter(after: Question, prompt: string): Promise<string>;
  save(question: Question): Promise<void>;
  deleteCustom(bookId: string, questionId: string): Promise<boolean>;
  /** Заменить тексты стандартных вопросов (смена языка книги). */
  replaceTemplates(bookId: string, byKey: ReadonlyMap<string, { prompt: string; title: string; hint: string | null }>): Promise<void>;
}

export interface PhotoRepository {
  findInBook(bookId: string, photoId: string): Promise<Photo | null>;
  stats(bookId: string): Promise<{ count: number; maxPosition: number }>;
  belongToBook(bookId: string, ids: string[]): Promise<boolean>;
  add(photo: Photo): Promise<void>;
  save(photo: Photo): Promise<void>;
  delete(photo: Photo): Promise<void>;
  reorder(bookId: string, ids: string[]): Promise<void>;
}

export interface LetterRepository {
  findInBook(bookId: string, letterId: string): Promise<Letter | null>;
  count(bookId: string): Promise<number>;
  add(letter: Letter): Promise<void>;
  save(letter: Letter): Promise<void>;
  delete(bookId: string, letterId: string): Promise<boolean>;
}
