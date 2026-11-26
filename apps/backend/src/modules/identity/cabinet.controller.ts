import { Controller, Inject, UseGuards } from "@nestjs/common";
import type { Output, Parsed } from "@mybook/contracts";
import { messagesFor } from "@/i18n/messages";
import { cabinetBookView, cabinetHelpView, cabinetPhotosView, cabinetShelfView } from "@/lib/cabinet/views";
import { isBookEditableBy } from "@/modules/authoring/domain";
import type { CurrentUser as AuthUser } from "@/modules/identity";
import { CurrentUser } from "../../core/auth/current-user.decorator";
import { Input } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { BookAccess, BookAccessGuard, type AccessibleBook } from "./book-access.guard";
import { CABINET_BOOK_PORTS, type CabinetBookPorts } from "./identity.tokens";

/** Кабинет автора для клиентского приложения «MyBooks»: полка, штаб книги, вкладка «Фото» и помощник по книге. */
@Controller()
export class CabinetController {
  constructor(@Inject(CABINET_BOOK_PORTS) private readonly cabinet: CabinetBookPorts) {}

  @Endpoint("cabinetShelf")
  async shelf(@CurrentUser() user: AuthUser): Promise<Output<"cabinetShelf">> {
    const locale = user.locale === "kk" ? "kk" : "ru";
    const m = messagesFor(locale);
    const books = await this.cabinet.shelfBooks(user.id, locale, m);
    return cabinetShelfView(books, user.name, m);
  }

  @Endpoint("cabinetBook")
  @UseGuards(BookAccessGuard)
  async book(@CurrentUser() user: AuthUser, @BookAccess() access: AccessibleBook): Promise<Output<"cabinetBook">> {
    const locale = user.locale === "kk" ? "kk" : "ru";
    const m = messagesFor(locale);
    const hub = await this.cabinet.bookHub(access.book, locale, m);
    return cabinetBookView(access.book, hub, locale, m);
  }

  @Endpoint("cabinetPhotos")
  @UseGuards(BookAccessGuard)
  async photos(@CurrentUser() user: AuthUser, @BookAccess() access: AccessibleBook): Promise<Output<"cabinetPhotos">> {
    const locale = user.locale === "kk" ? "kk" : "ru";
    const m = messagesFor(locale);
    const editable = access.book.status === "draft" && isBookEditableBy(access.book.userId, access.viewer);
    const data = await this.cabinet.photosTab(access.book, editable, m);
    return cabinetPhotosView(data, m);
  }

  @Endpoint("cabinetHelp")
  @UseGuards(BookAccessGuard)
  async help(
    @CurrentUser() user: AuthUser,
    @BookAccess() access: AccessibleBook,
    @Input() input: Parsed<"cabinetHelp">,
  ): Promise<Output<"cabinetHelp">> {
    const locale = user.locale === "kk" ? "kk" : "ru";
    const m = messagesFor(locale);
    const thread = await this.cabinet.helpThread(access.book, user.id);
    return cabinetHelpView(thread, input.section, m);
  }

  @Endpoint("cabinetHelpAsk")
  @UseGuards(BookAccessGuard)
  async helpAsk(
    @CurrentUser() user: AuthUser,
    @BookAccess() access: AccessibleBook,
    @Input() input: Parsed<"cabinetHelpAsk">,
  ): Promise<Output<"cabinetHelpAsk">> {
    const locale = user.locale === "kk" ? "kk" : "ru";
    const r = await this.cabinet.helpAsk(
      access.book,
      user,
      { text: input.body.text, place: null, human: input.body.human },
      locale,
    );
    return { outcome: r.outcome, suggestions: r.suggestions, messages: r.messages };
  }
}
