import { Controller, Inject } from "@nestjs/common";
import type { Output, Parsed } from "@mybook/contracts";
import type { Locale } from "@/i18n/config";
import type { BookRow, BookViewer } from "@/modules/authoring";
import { buildCoverDesignInitPatch, buildCoverDesignResetPatch, buildCoverDesignSavePatch, buildCoverView } from "@/modules/authoring/ui/coverView";
import { ApiError } from "../../core/errors/api-error";
import { Input, RequestLocale } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { AUTHORING, type AuthoringFacade } from "./authoring.tokens";
import { AccessibleBook, BookAccess, BookAccessViewer } from "./book-access.guard";

/**
 * Обложка книги и конструктор обложки (/api/v1/books/:bookId/cover*).
 */
@Controller()
export class CoverController {
  constructor(@Inject(AUTHORING) private readonly authoring: AuthoringFacade) {}

  @Endpoint("coverGet")
  @BookAccess("read")
  coverGet(@AccessibleBook() book: BookRow, @BookAccessViewer() viewer: BookViewer, @RequestLocale() locale: Locale): Output<"coverGet"> {
    return buildCoverView(book, viewer, locale);
  }

  @Endpoint("coverUpdate")
  @BookAccess("edit")
  async coverUpdate(
    @BookAccessViewer() viewer: BookViewer,
    @Input() input: Parsed<"coverUpdate">,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"coverUpdate">> {
    await this.authoring.books.updateSettings(input.bookId, viewer, input.body, this.authoring.photoRepository);
    const updated = await this.authoring.queries.book(input.bookId);
    if (!updated) throw new ApiError(404, "bookNotFound");
    return buildCoverView(updated, viewer, locale);
  }

  @Endpoint("coverDesignSave")
  @BookAccess("edit")
  async coverDesignSave(
    @BookAccessViewer() viewer: BookViewer,
    @Input() input: Parsed<"coverDesignSave">,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"coverDesignSave">> {
    const patch = buildCoverDesignSavePatch(input.body);
    await this.authoring.books.updateSettings(input.bookId, viewer, patch, this.authoring.photoRepository);
    const updated = await this.authoring.queries.book(input.bookId);
    if (!updated) throw new ApiError(404, "bookNotFound");
    return buildCoverView(updated, viewer, locale);
  }

  @Endpoint("coverDesignInit")
  @BookAccess("edit")
  async coverDesignInit(
    @AccessibleBook() book: BookRow,
    @BookAccessViewer() viewer: BookViewer,
    @Input() input: Parsed<"coverDesignInit">,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"coverDesignInit">> {
    const built = await buildCoverDesignInitPatch(book, input.body, () => this.authoring.queries.photos(book.id));
    if (!built.ok) throw new ApiError(400, "badRequest");
    if (built.patch) await this.authoring.books.updateSettings(input.bookId, viewer, built.patch, this.authoring.photoRepository);
    const updated = await this.authoring.queries.book(input.bookId);
    if (!updated) throw new ApiError(404, "bookNotFound");
    return buildCoverView(updated, viewer, locale);
  }

  @Endpoint("coverDesignReset")
  @BookAccess("edit")
  async coverDesignReset(
    @AccessibleBook() book: BookRow,
    @BookAccessViewer() viewer: BookViewer,
    @Input() input: Parsed<"coverDesignReset">,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"coverDesignReset">> {
    const patch = buildCoverDesignResetPatch(book, input.body);
    await this.authoring.books.updateSettings(input.bookId, viewer, patch, this.authoring.photoRepository);
    const updated = await this.authoring.queries.book(input.bookId);
    if (!updated) throw new ApiError(404, "bookNotFound");
    return buildCoverView(updated, viewer, locale);
  }
}
