import { Controller, Inject } from "@nestjs/common";
import type { Output, Parsed } from "@mybook/contracts";
import { isLocale, type Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { createBookSchema, startBookInput } from "@/lib/book/create-book-schema";
import { getThemes } from "@/lib/content/themes";
import type { BookRow, BookViewer } from "@/modules/authoring";
import { buildBookModelView } from "@/modules/authoring/ui/bookModelView";
import { buildBookEditorView, toBookSummary, toTheme } from "@/modules/authoring/ui/booksView";
import { buildBookWizardView, buildWizardDeadlineView } from "@/modules/authoring/ui/wizardView";
import type { CurrentUser as AuthUser } from "@/modules/identity";
import { isPrintedPlan, lastOrderPerBook } from "@/modules/ordering/ui/status";
import { CurrentUser } from "../../core/auth/current-user.decorator";
import { Input, RequestLocale } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import {
  AUTHORING,
  AUTHORING_ORDERING,
  AUTHORING_PHOTO_LIMIT,
  AUTHORING_PREVIEWS,
  type AuthoringFacade,
  type AuthoringOrderingPort,
  type AuthoringPreviewsPort,
  type PhotoLimitPort,
} from "./authoring.tokens";
import { AccessibleBook, BookAccess, BookAccessViewer } from "./book-access.guard";

/**
 * Основа Authoring: виды книг, мастер новой книги, список, редактор, автосохранение ответа и 3D-модель книги.
 * Вся сборка DTO — в чистых модулях src/modules/authoring/ui/* (один источник с mybook-api).
 */
@Controller()
export class BooksController {
  constructor(
    @Inject(AUTHORING) private readonly authoring: AuthoringFacade,
    @Inject(AUTHORING_ORDERING) private readonly ordering: AuthoringOrderingPort,
    @Inject(AUTHORING_PREVIEWS) private readonly previews: AuthoringPreviewsPort,
    @Inject(AUTHORING_PHOTO_LIMIT) private readonly photoLimit: PhotoLimitPort,
  ) {}

  @Endpoint("themesList")
  themesList(@Input() input: Parsed<"themesList">, @RequestLocale() reqLocale: Locale): Output<"themesList"> {
    const raw = input.locale ?? reqLocale;
    return { themes: getThemes(isLocale(raw) ? raw : "ru").map(toTheme) };
  }

  @Endpoint("bookCreate")
  async bookCreate(
    @CurrentUser() user: AuthUser,
    @Input() input: Parsed<"bookCreate">,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"bookCreate"> | Response> {
    const m = messagesFor(locale);
    const parsed = createBookSchema(m.books.wizard.errors).safeParse(input.body);
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message, code: "badData" }, { status: 400 });
    const book = await this.authoring.books.start(user.id, startBookInput(parsed.data));
    return { id: book.id };
  }

  @Endpoint("booksList")
  async booksList(@CurrentUser() user: AuthUser): Promise<Output<"booksList">> {
    const [rows, orders] = await Promise.all([this.authoring.queries.userBooks(user.id), this.ordering.userOrders(user.id)]);
    const last = lastOrderPerBook(orders);
    return {
      books: rows.map((r) => {
        const order = last.get(r.book.id);
        return toBookSummary(r, order ? { id: order.id, number: order.number, status: order.status, printed: isPrintedPlan(order.plan) } : null);
      }),
    };
  }

  @Endpoint("bookWizard")
  bookWizard(@CurrentUser() user: AuthUser, @RequestLocale() rawLocale: Locale): Output<"bookWizard"> {
    const locale = isLocale(rawLocale) ? rawLocale : "ru";
    return buildBookWizardView(locale, messagesFor(locale), user.name ?? "");
  }

  @Endpoint("wizardDeadline")
  wizardDeadline(@Input() input: Parsed<"wizardDeadline">, @RequestLocale() locale: Locale): Output<"wizardDeadline"> {
    return buildWizardDeadlineView(input.occasion, input.date, messagesFor(locale));
  }

  @Endpoint("bookEditor")
  @BookAccess("read")
  async bookEditor(@AccessibleBook() book: BookRow, @BookAccessViewer() viewer: BookViewer): Promise<Output<"bookEditor">> {
    const q = this.authoring.queries;
    const [questions, chapters, photos, letters, maxPhotos] = await Promise.all([
      q.questions(book.id),
      q.chapters(book.id),
      q.photos(book.id),
      q.approvedLetters(book.id),
      this.photoLimit.maxPhotos(),
    ]);
    return buildBookEditorView({ book, viewer, questions, chapters, photos, letters, maxPhotos });
  }

  @Endpoint("questionSave")
  @BookAccess("viewer")
  async questionSave(@Input() input: Parsed<"questionSave">, @BookAccessViewer() viewer: BookViewer): Promise<Output<"questionSave">> {
    await this.authoring.questions.edit(input.bookId, viewer, input.questionId, input.body);
    return { ok: true, updatedAt: new Date().toISOString() };
  }

  @Endpoint("bookModel")
  @BookAccess("read")
  async bookModel(
    @AccessibleBook() book: BookRow,
    @Input() input: Parsed<"bookModel">,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"bookModel">> {
    const pages =
      input.pages ??
      (await this.previews.current(book.id).catch(() => null))?.pageCount ??
      (await this.authoring.queries.stats(book)).printedPages;
    return buildBookModelView(book, pages, messagesFor(locale).books.preview);
  }
}
