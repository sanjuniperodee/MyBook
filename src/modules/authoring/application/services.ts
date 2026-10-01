import type { Clock, UnitOfWork } from "@/shared/application";
import type { Locale } from "@/i18n/config";
import { AuthoringError, Book, Letter, MAX_LETTERS, MAX_PHOTOS, MAX_QUESTIONS, Photo, type BookRepository, type BookSettings, type BookViewer, type Gender, type LetterRepository, type LetterStatus, type PhotoProps, type PhotoRepository, type QuestionRepository } from "../domain";
import type { FileStore, IdGenerator, ImageProcessor, OrdersLookup, ThemeCatalog } from "./ports";

/** Загрузка книги с проверкой доступа: чужая книга — как будто её нет. */
async function loadBook(books: BookRepository, bookId: string, viewer: BookViewer, opts: { editable?: boolean } = {}) {
  const book = await books.findById(bookId);
  if (!book || !book.isVisibleTo(viewer)) throw new AuthoringError("bookNotFound");
  if (opts.editable) book.assertEditable();
  return book;
}

export class BooksService {
  constructor(
    private readonly books: BookRepository,
    private readonly questions: QuestionRepository,
    private readonly themes: ThemeCatalog,
    private readonly orders: OrdersLookup,
    private readonly files: FileStore,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async start(userId: string, input: { theme: string; language: Locale; authorName: string; authorGender: Gender; recipientName: string; recipientGender: Gender; title?: string; occasion?: string | null; occasionDate?: string | null }) {
    const theme = this.themes.get(input.theme, input.language);
    const { book, questions } = Book.start(this.books.nextId(), { userId, ...input }, theme, this.clock.now());
    await this.uow.run(async () => {
      await this.books.add(book, questions);
      this.uow.track(book);
    });
    return book;
  }

  /** Настройки из редактора (включая смену языка книги). */
  async updateSettings(bookId: string, viewer: BookViewer, patch: BookSettings & { language?: Locale; coverPhotoId?: string | null }, photos: PhotoRepository) {
    return this.uow.run(async () => {
      const book = await loadBook(this.books, bookId, viewer, { editable: true });
      const { language, coverPhotoId, ...settings } = patch;
      if (coverPhotoId !== undefined) {
        if (coverPhotoId && !(await photos.findInBook(book.id, coverPhotoId))) throw new AuthoringError("photoNotFound");
        book.setCoverPhoto(coverPhotoId);
      }
      if (language && language !== book.language) {
        const texts = book.switchLanguage(language, this.themes.get(book.theme, book.language), this.themes.get(book.theme, language));
        await this.questions.replaceTemplates(book.id, texts);
      }
      book.applySettings(settings);
      await this.books.save(book);
      return book;
    });
  }

  /** Удалить книгу можно, пока по ней нет заказов; файлы фото и кэш предпросмотра — тоже. */
  async delete(bookId: string, viewer: BookViewer) {
    const book = await loadBook(this.books, bookId, viewer, { editable: true });
    if (await this.orders.bookHasOrders(book.id)) throw new AuthoringError("bookHasOrders");
    await this.books.delete(book.id);
    await this.files.deletePrefix(`photos/${book.id}`);
    await this.files.deletePrefix(`cache/preview/${book.id}`);
  }

  async setLetterInvite(bookId: string, viewer: BookViewer, enabled: boolean, regenerate: boolean) {
    const book = await loadBook(this.books, bookId, viewer, { editable: true });
    const token = book.setLetterInvite(enabled, regenerate, () => this.ids.inviteToken());
    await this.books.save(book);
    return token;
  }
}

/**
 * Книга и заказ: готовность к печати, блокировка на время заказа. Вызывается контекстом Ordering
 * (внутри его транзакции — запросы идут через текущий Unit of Work).
 */
export class BookOrderingService {
  constructor(
    private readonly books: BookRepository,
    private readonly readiness: (bookId: string, locale: Locale) => Promise<{ blockingIssue: string | null; estimatedPages: number } | null>,
  ) {}

  async checkoutInfo(bookId: string, userId: string, locale: Locale) {
    const book = await this.books.findById(bookId);
    if (!book || book.userId !== userId) return null;
    const r = await this.readiness(bookId, locale);
    return r ? { status: book.status, ...r } : null;
  }

  lockForOrder(bookId: string) {
    return this.books.lockForOrder(bookId);
  }

  unlock(bookId: string) {
    return this.books.setStatus(bookId, "draft");
  }

  /** Сотрудник временно открывает заказанную книгу для правок (и закрывает обратно). */
  async toggleEditing(bookId: string): Promise<"draft" | "ordered"> {
    const book = await this.books.findById(bookId);
    const next = book?.status === "draft" ? "ordered" : "draft";
    await this.books.setStatus(bookId, next);
    return next;
  }
}

export class QuestionsService {
  constructor(
    private readonly books: BookRepository,
    private readonly questions: QuestionRepository,
    private readonly uow: UnitOfWork,
  ) {}

  /** Автосохранение ответа/заголовка. */
  async edit(bookId: string, viewer: BookViewer, questionId: string, patch: { answer?: string; displayText?: string | null; hideHeading?: boolean }) {
    return this.uow.run(async () => {
      const book = await loadBook(this.books, bookId, viewer, { editable: true });
      const q = await this.questions.findInBook(book.id, questionId);
      if (!q) throw new AuthoringError("questionNotFound");
      q.edit(patch);
      await this.questions.save(q);
      await this.books.touch(book.id);
      this.uow.track(q);
    });
  }

  /** Свой вопрос — сразу после указанного, в ту же главу. */
  async addCustom(bookId: string, viewer: BookViewer, afterId: string, prompt: string) {
    return this.uow.run(async () => {
      const book = await loadBook(this.books, bookId, viewer, { editable: true });
      const after = await this.questions.findInBook(book.id, afterId);
      if (!after) throw new AuthoringError("questionNotFound");
      if ((await this.questions.count(book.id)) >= MAX_QUESTIONS) throw new AuthoringError("questionsLimit");
      return this.questions.insertAfter(after, prompt.trim());
    });
  }

  /** Удалять можно только собственные вопросы. */
  async deleteCustom(bookId: string, viewer: BookViewer, questionId: string) {
    const book = await loadBook(this.books, bookId, viewer, { editable: true });
    if (!(await this.questions.deleteCustom(book.id, questionId))) throw new AuthoringError("onlyOwnQuestions");
  }
}

export class PhotosService {
  constructor(
    private readonly books: BookRepository,
    private readonly photos: PhotoRepository,
    private readonly questions: QuestionRepository,
    private readonly images: ImageProcessor,
    private readonly files: FileStore,
    private readonly ids: IdGenerator,
  ) {}

  /** Загрузка пачки фото: каждое обрабатывается отдельно, ошибки по файлам возвращаются списком. */
  async upload(bookId: string, viewer: BookViewer, files: { name: string; size: number; bytes: () => Promise<Buffer> }[]) {
    const book = await loadBook(this.books, bookId, viewer, { editable: true });
    if (!files.length) throw new AuthoringError("photosPick");
    const { count, maxPosition } = await this.photos.stats(book.id);
    if (count + files.length > MAX_PHOTOS) throw new AuthoringError("photosLimit");
    const created: Photo[] = [];
    const failed: { name: string; reason: "tooBig" | "format" }[] = [];
    let position = maxPosition + 1;
    for (const file of files) {
      if (file.size > this.images.maxUploadBytes) {
        failed.push({ name: file.name, reason: "tooBig" });
        continue;
      }
      try {
        const img = await this.images.process(await file.bytes());
        const id = this.ids.uuid();
        const storageKey = `photos/${book.id}/${id}.jpg`;
        const thumbKey = `photos/${book.id}/${id}_thumb.jpg`;
        await this.files.put(storageKey, img.full);
        await this.files.put(thumbKey, img.thumb);
        const photo = Photo.uploaded(id, { bookId: book.id, position: position++, storageKey, thumbKey, width: img.width, height: img.height });
        await this.photos.add(photo);
        created.push(photo);
      } catch (err) {
        console.error("[photos] upload failed", err);
        failed.push({ name: file.name, reason: "format" });
      }
    }
    await this.books.touch(book.id);
    return { created, failed };
  }

  async update(bookId: string, viewer: BookViewer, photoId: string, patch: Parameters<Photo["update"]>[0]) {
    const book = await loadBook(this.books, bookId, viewer, { editable: true });
    if (patch.questionId && !(await this.questions.findInBook(book.id, patch.questionId))) throw new AuthoringError("questionNotFound");
    const photo = await this.photos.findInBook(book.id, photoId);
    if (!photo) throw new AuthoringError("photoNotFound");
    photo.update(patch);
    await this.photos.save(photo);
    await this.books.touch(book.id);
    return photo;
  }

  async delete(bookId: string, viewer: BookViewer, photoId: string) {
    const book = await loadBook(this.books, bookId, viewer, { editable: true });
    const photo = await this.photos.findInBook(book.id, photoId);
    if (!photo) throw new AuthoringError("photoNotFound");
    await this.photos.delete(photo);
    if (book.coverPhotoId === photo.id) {
      book.forgetPhoto(photo.id);
      await this.books.save(book);
    }
    await Promise.all([this.files.delete(photo.storageKey), this.files.delete(photo.thumbKey)]);
    await this.books.touch(book.id);
  }

  async reorder(bookId: string, viewer: BookViewer, ids: string[]) {
    const book = await loadBook(this.books, bookId, viewer, { editable: true });
    if (!(await this.photos.belongToBook(book.id, ids))) throw new AuthoringError("photosOutdated");
    await this.photos.reorder(book.id, ids);
  }

  /** Поворот самого файла на 90°. Новые ключи — чтобы браузер и кэш предпросмотра не показали старую ориентацию. */
  async rotate(bookId: string, viewer: BookViewer, photoId: string) {
    const book = await loadBook(this.books, bookId, viewer, { editable: true });
    const photo = await this.photos.findInBook(book.id, photoId);
    if (!photo) throw new AuthoringError("photoNotFound");
    const [full, thumb] = await Promise.all([this.files.get(photo.storageKey), this.files.get(photo.thumbKey)]);
    const out = await this.images.rotate(full, thumb);
    const rev = this.ids.revision();
    const keys = { storageKey: `photos/${book.id}/${photo.id}_${rev}.jpg`, thumbKey: `photos/${book.id}/${photo.id}_${rev}_thumb.jpg` };
    await Promise.all([this.files.put(keys.storageKey, out.full), this.files.put(keys.thumbKey, out.thumb)]);
    const previous = photo.rotated(keys);
    await this.photos.save(photo);
    await Promise.all([this.files.delete(previous.storageKey), this.files.delete(previous.thumbKey)]).catch(() => {});
    await this.books.touch(book.id);
    return photo;
  }
}

export class LettersService {
  constructor(
    private readonly books: BookRepository,
    private readonly letters: LetterRepository,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
  ) {}

  /** Письмо по публичной ссылке-приглашению: ждёт одобрения владельца книги. */
  async submit(token: string, input: { authorName: string; relation: string; text: string }) {
    if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) throw new AuthoringError("letterInvalid");
    const book = await this.books.findByInviteToken(token);
    if (!book) throw new AuthoringError("letterClosed");
    book.assertAcceptsLetters();
    if ((await this.letters.count(book.id)) >= MAX_LETTERS) throw new AuthoringError("letterLimit");
    const letter = Letter.submit(this.ids.uuid(), { bookId: book.id, ...input });
    await this.uow.run(async () => {
      await this.letters.add(letter);
      this.uow.track(letter);
    });
    return letter;
  }

  async edit(bookId: string, viewer: BookViewer, letterId: string, patch: { status?: LetterStatus; authorName?: string; relation?: string; text?: string }) {
    const book = await loadBook(this.books, bookId, viewer, { editable: true });
    const letter = await this.letters.findInBook(book.id, letterId);
    if (!letter) throw new AuthoringError("letterNotFound");
    letter.edit(patch);
    await this.letters.save(letter);
    await this.books.touch(book.id);
    return letter;
  }

  async delete(bookId: string, viewer: BookViewer, letterId: string) {
    const book = await loadBook(this.books, bookId, viewer, { editable: true });
    if (!(await this.letters.delete(book.id, letterId))) throw new AuthoringError("letterNotFound");
  }
}

export type PhotoLayout = PhotoProps["layout"];
