import { Module } from "@nestjs/common";
import { BookAccessGuard } from "./book-access.guard";
import { BooksController } from "./books.controller";
import { CoverController } from "./cover.controller";
import { LettersController } from "./letters.controller";
import { PhotosController } from "./photos.controller";
import { PreviewController } from "./preview.controller";
import { WebBookPagesController } from "./web-book-pages.controller";
import { WebBookPagesQuery } from "./web-book-pages.query";

/**
 * Контекст Authoring (часть 1 — 37 контрактных маршрутов API v1):
 * основа книг, 3D-модель, мастер, веб-страницы редактора, фото, фоторедактор, диктовка, письма, обложка, превью.
 * Порты смежных контекстов приходят из глобального LegacyModule; предметная область — без декораторов Nest.
 */
@Module({
  controllers: [BooksController, WebBookPagesController, PhotosController, LettersController, CoverController, PreviewController],
  providers: [BookAccessGuard, WebBookPagesQuery],
})
export class AuthoringApiModule {}
