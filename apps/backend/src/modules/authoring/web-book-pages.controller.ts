import { Controller, Inject } from "@nestjs/common";
import type { Output, Parsed } from "@mybook/contracts";
import { isLocale, type Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import type { BookRow, BookViewer } from "@/modules/authoring";
import { toWebBookRow } from "@/modules/authoring/ui/webBookPagesView";
import { Input, RequestLocale } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { AccessibleBook, BookAccess, BookAccessViewer } from "./book-access.guard";
import { WebBookPagesQuery } from "./web-book-pages.query";

function resolveLocale(raw: string | undefined, reqLocale: Locale): Locale {
  if (isLocale(raw)) return raw;
  return isLocale(reqLocale) ? reqLocale : "ru";
}

/**
 * 9 маршрутов веб-страниц и оболочки редактора книги (/api/v1/web/books/*).
 * Доступ проверяет BookAccessGuard (режим read), сборку DTO — WebBookPagesQuery.
 */
@Controller()
@BookAccess("read")
export class WebBookPagesController {
  constructor(@Inject(WebBookPagesQuery) private readonly pages: WebBookPagesQuery) {}

  @Endpoint("webBook")
  webBook(@AccessibleBook() book: BookRow): Output<"webBook"> {
    return { book: toWebBookRow(book) };
  }

  @Endpoint("webBookHub")
  webBookHub(
    @AccessibleBook() book: BookRow,
    @Input() input: Parsed<"webBookHub">,
    @RequestLocale() reqLocale: Locale,
  ): Promise<Output<"webBookHub">> {
    const locale = resolveLocale(input.locale, reqLocale);
    return this.pages.hub(book, locale, messagesFor(locale));
  }

  @Endpoint("webBookNav")
  webBookNav(
    @AccessibleBook() book: BookRow,
    @Input() input: Parsed<"webBookNav">,
    @RequestLocale() reqLocale: Locale,
  ): Promise<Output<"webBookNav">> {
    const locale = resolveLocale(input.locale, reqLocale);
    return this.pages.nav(book, locale);
  }

  @Endpoint("webBookQuestionsPage")
  webBookQuestionsPage(@AccessibleBook() book: BookRow, @BookAccessViewer() viewer: BookViewer): Promise<Output<"webBookQuestionsPage">> {
    return this.pages.questionsPage(book, viewer);
  }

  @Endpoint("webBookPhotosPage")
  webBookPhotosPage(
    @AccessibleBook() book: BookRow,
    @BookAccessViewer() viewer: BookViewer,
    @Input() input: Parsed<"webBookPhotosPage">,
    @RequestLocale() reqLocale: Locale,
  ): Promise<Output<"webBookPhotosPage">> {
    const locale = resolveLocale(input.locale, reqLocale);
    return this.pages.photosPage(book, viewer, messagesFor(locale));
  }

  @Endpoint("webBookLettersPage")
  webBookLettersPage(@AccessibleBook() book: BookRow): Promise<Output<"webBookLettersPage">> {
    return this.pages.lettersPage(book.id);
  }

  @Endpoint("webBookCoverPage")
  webBookCoverPage(
    @AccessibleBook() book: BookRow,
    @Input() input: Parsed<"webBookCoverPage">,
    @RequestLocale() reqLocale: Locale,
  ): Promise<Output<"webBookCoverPage">> {
    const locale = resolveLocale(input.locale, reqLocale);
    return this.pages.coverPage(book, locale, messagesFor(locale));
  }

  @Endpoint("webBookPagesPage")
  webBookPagesPage(
    @AccessibleBook() book: BookRow,
    @BookAccessViewer() viewer: BookViewer,
    @Input() input: Parsed<"webBookPagesPage">,
    @RequestLocale() reqLocale: Locale,
  ): Promise<Output<"webBookPagesPage">> {
    const locale = resolveLocale(input.locale, reqLocale);
    return this.pages.pagesPage(book, viewer, messagesFor(locale));
  }

  @Endpoint("webBookPreviewPage")
  webBookPreviewPage(@AccessibleBook() book: BookRow, @BookAccessViewer() viewer: BookViewer): Promise<Output<"webBookPreviewPage">> {
    return this.pages.previewPage(book, viewer);
  }
}
