import "server-only";
import type { Clock, EventBus, Mailer, UnitOfWork } from "@/shared/application";
import { BookOrderingService, BookOutlineService, BooksService, LayoutRev2Service, LettersService, PhotosService, QuestionsService, type LayoutUpgrade, type OrdersLookup } from "./application";
import { checkReadiness, UPGRADE_ON_TOUCH } from "./domain";
import type { LetterSubmitted } from "./domain";
import { contentThemes, randomIds, sharpImages, storageFiles } from "./infrastructure/adapters";
import { notifyOwnerAboutLetter } from "./infrastructure/LetterMailer";
import { DrizzleBookRepository, DrizzleChapterRepository, DrizzleLetterRepository, DrizzlePhotoRepository, DrizzleQuestionRepository } from "./infrastructure/persistence";
import { DrizzleLayoutRevStore } from "./infrastructure/layoutRevStore";
import { photoViewFile } from "./infrastructure/photoView";
import { DrizzleAuthoringQueries } from "./infrastructure/queries";

export * from "./domain";
export type { BookBundle, BookRow, ChapterRow, LetterRow, PhotoRow, QuestionRow } from "./infrastructure/queries";
export type { LayoutRev2Result, LayoutRevBackupBook } from "./application";

/** Публичный фасад контекста Authoring: книги, вопросы, оглавление своей книги, фото, письма близких. */
export class AuthoringModule {
  readonly books: BooksService;
  readonly questions: QuestionsService;
  /** Главы и разделы своей книги (тема blank). */
  readonly outline: BookOutlineService;
  readonly photos: PhotosService;
  readonly letters: LettersService;
  readonly ordering: BookOrderingService;
  /** Перевод книг на правила раскладки фото 2: скрипт npm run photos:layout-rev2 и перевод при правке (выпуск 2). */
  readonly layoutRev: LayoutRev2Service;
  readonly queries = new DrizzleAuthoringQueries();

  /** Файл фото (оригинал или миниатюра) из хранилища — права проверяет вызывающий через queries.photoFor(). */
  photoFile(storageKey: string) {
    return storageFiles.get(storageKey);
  }
  /** Уменьшенная копия фото для 3D-просмотра (кэшируется): права проверяет вызывающий. */
  photoViewFile(storageKey: string) {
    return photoViewFile(storageKey);
  }
  readonly photoRepository = new DrizzlePhotoRepository();
  readonly themes = contentThemes;

  constructor(deps: { uow: UnitOfWork; clock: Clock; bus: EventBus; orders: OrdersLookup; mailer: Mailer }) {
    const books = new DrizzleBookRepository();
    const questions = new DrizzleQuestionRepository();
    const chapters = new DrizzleChapterRepository();
    this.layoutRev = new LayoutRev2Service(new DrizzleLayoutRevStore(), deps.uow);
    const layout: LayoutUpgrade = { onTouch: UPGRADE_ON_TOUCH, upgrade: (bookId) => this.layoutRev.upgradeInPlace(bookId) };
    this.books = new BooksService(books, questions, contentThemes, deps.orders, storageFiles, randomIds, deps.uow, deps.clock, chapters, layout);
    this.questions = new QuestionsService(books, questions, deps.uow, this.photoRepository, chapters);
    this.outline = new BookOutlineService(books, questions, chapters, this.photoRepository, randomIds, deps.uow);
    this.photos = new PhotosService(books, this.photoRepository, questions, sharpImages, storageFiles, randomIds, deps.uow, layout);
    this.letters = new LettersService(books, new DrizzleLetterRepository(), randomIds, deps.uow);
    this.ordering = new BookOrderingService(books, async (bookId, locale) => {
      const book = await this.queries.book(bookId);
      if (!book) return null;
      const [stats, ps] = await Promise.all([this.queries.stats(book), this.queries.photos(bookId)]);
      const blocking = checkReadiness(book, stats, ps, locale).find((i) => i.level === "error");
      return { blockingIssue: blocking?.text ?? null, estimatedPages: stats.printedPages };
    });
    deps.bus.subscribe<LetterSubmitted>("authoring.letter_submitted", notifyOwnerAboutLetter(deps.mailer), "authoring.mail.letter_submitted");
  }
}
