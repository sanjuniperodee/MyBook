import { Controller, Inject } from "@nestjs/common";
import type { Output, Parsed } from "@mybook/contracts";
import { toBuildProgressDto, toBuildStateDto } from "@/modules/authoring/ui/previewView";
import { ApiError } from "../../core/errors/api-error";
import { Input } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { AUTHORING_PREVIEWS, type AuthoringPreviewsPort } from "./authoring.tokens";
import { BookAccess } from "./book-access.guard";

/**
 * Экранная сборка предпросмотра книги и её прогресс (/api/v1/books/:bookId/build*).
 */
@Controller()
@BookAccess("read")
export class PreviewController {
  constructor(@Inject(AUTHORING_PREVIEWS) private readonly previews: AuthoringPreviewsPort) {}

  @Endpoint("bookBuild")
  async bookBuild(@Input() input: Parsed<"bookBuild">): Promise<Output<"bookBuild">> {
    const state = await this.previews.build(input.bookId, { retry: input.retry === "1" });
    if (!state) throw new ApiError(404, "bookNotFound");
    return toBuildStateDto(input.bookId, state);
  }

  @Endpoint("bookBuildProgress")
  bookBuildProgress(@Input() input: Parsed<"bookBuildProgress">): Output<"bookBuildProgress"> {
    return toBuildProgressDto(this.previews.progressOf(input.bookId));
  }
}
