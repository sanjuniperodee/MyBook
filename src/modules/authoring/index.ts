import "server-only";
import type { Clock, EventBus, Mailer, UnitOfWork } from "@/shared/application";
import { BookOrderingService, BooksService, LettersService, PhotosService, QuestionsService, type OrdersLookup } from "./application";
import { checkReadiness } from "./domain";
import type { LetterSubmitted } from "./domain";
import { contentThemes, randomIds, sharpImages, storageFiles } from "./infrastructure/adapters";
import { notifyOwnerAboutLetter } from "./infrastructure/LetterMailer";
import { DrizzleBookRepository, DrizzleLetterRepository, DrizzlePhotoRepository, DrizzleQuestionRepository } from "./infrastructure/persistence";
import { DrizzleAuthoringQueries } from "./infrastructure/queries";

export * from "./domain";
export type { BookBundle, BookRow, LetterRow, PhotoRow, QuestionRow } from "./infrastructure/queries";

/** Публичный фасад контекста Authoring: книги, вопросы, фото, письма близких. */
export class AuthoringModule {
  readonly books: BooksService;
  readonly questions: QuestionsService;
  readonly photos: PhotosService;
  readonly letters: LettersService;
  readonly ordering: BookOrderingService;
  readonly queries = new DrizzleAuthoringQueries();

  /** Файл фото (оригинал или миниатюра) из хранилища — права проверяет вызывающий через queries.photoFor(). */
  photoFile(storageKey: string) {
    return storageFiles.get(storageKey);
  }
  readonly photoRepository = new DrizzlePhotoRepository();
  readonly themes = contentThemes;

  constructor(deps: { uow: UnitOfWork; clock: Clock; bus: EventBus; orders: OrdersLookup; mailer: Mailer }) {
    const books = new DrizzleBookRepository();
    const questions = new DrizzleQuestionRepository();
    this.books = new BooksService(books, questions, contentThemes, deps.orders, storageFiles, randomIds, deps.uow, deps.clock);
    this.questions = new QuestionsService(books, questions, deps.uow);
    this.photos = new PhotosService(books, this.photoRepository, questions, sharpImages, storageFiles, randomIds);
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
