import { Controller, Inject } from "@nestjs/common";
import type { Output, Parsed } from "@mybook/contracts";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import type { BookRow, BookViewer } from "@/modules/authoring";
import { buildLettersView, letterInviteDto, toLetterDto } from "@/modules/authoring/ui/lettersView";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { ApiError } from "../../core/errors/api-error";
import { Input, RequestLocale } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { AUTHORING, type AuthoringFacade } from "./authoring.tokens";
import { AccessibleBook, BookAccess, BookAccessViewer } from "./book-access.guard";

/**
 * Письма близких и ссылка-приглашение книги (/api/v1/books/:bookId/letters*).
 */
@Controller()
export class LettersController {
  constructor(
    @Inject(AUTHORING) private readonly authoring: AuthoringFacade,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private async bookAfterChange(bookId: string): Promise<BookRow> {
    const book = await this.authoring.queries.book(bookId);
    if (!book) throw new ApiError(404, "bookNotFound");
    return book;
  }

  @Endpoint("lettersGet")
  @BookAccess("read")
  async lettersGet(
    @AccessibleBook() book: BookRow,
    @BookAccessViewer() viewer: BookViewer,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"lettersGet">> {
    const letters = await this.authoring.queries.letters(book.id);
    return buildLettersView(book, viewer, letters, messagesFor(locale), this.config.appUrl);
  }

  @Endpoint("letterInviteSet")
  @BookAccess("viewer")
  async letterInviteSet(@Input() input: Parsed<"letterInviteSet">, @BookAccessViewer() viewer: BookViewer): Promise<Output<"letterInviteSet">> {
    await this.authoring.books.setLetterInvite(input.bookId, viewer, input.body.enabled, !!input.body.regenerate);
    return letterInviteDto(await this.bookAfterChange(input.bookId), this.config.appUrl);
  }

  @Endpoint("letterInviteText")
  @BookAccess("viewer")
  async letterInviteText(@Input() input: Parsed<"letterInviteText">, @BookAccessViewer() viewer: BookViewer): Promise<Output<"letterInviteText">> {
    await this.authoring.books.updateSettings(input.bookId, viewer, { inviteText: input.body.text }, this.authoring.photoRepository);
    return letterInviteDto(await this.bookAfterChange(input.bookId), this.config.appUrl);
  }

  @Endpoint("lettersReorder")
  @BookAccess("viewer")
  async lettersReorder(@Input() input: Parsed<"lettersReorder">, @BookAccessViewer() viewer: BookViewer): Promise<Output<"lettersReorder">> {
    await this.authoring.letters.reorder(input.bookId, viewer, input.body.ids);
    return { ok: true };
  }

  @Endpoint("letterUpdate")
  @BookAccess("viewer")
  async letterUpdate(@Input() input: Parsed<"letterUpdate">, @BookAccessViewer() viewer: BookViewer): Promise<Output<"letterUpdate">> {
    await this.authoring.letters.edit(input.bookId, viewer, input.letterId, input.body);
    const letter = (await this.authoring.queries.letters(input.bookId)).find((l) => l.id === input.letterId);
    if (!letter) throw new ApiError(404, "notFound");
    return { letter: toLetterDto(letter) };
  }

  @Endpoint("letterDelete")
  @BookAccess("viewer")
  async letterDelete(@Input() input: Parsed<"letterDelete">, @BookAccessViewer() viewer: BookViewer): Promise<Output<"letterDelete">> {
    await this.authoring.letters.delete(input.bookId, viewer, input.letterId);
    return { ok: true };
  }
}
