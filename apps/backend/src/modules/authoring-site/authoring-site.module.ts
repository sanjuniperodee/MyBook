import { Inject, Module, type OnModuleInit } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { FastifyInstance } from "fastify";
import { AuthoringMediaSiteController } from "./authoring-media.site-controller";
import { SiteBookAccessService } from "./authoring-site.helpers";
import { BooksAiSiteController } from "./books-ai.site-controller";
import { BooksBuildSiteController } from "./books-build.site-controller";
import { BooksMediaSiteController } from "./books-media.site-controller";
import { BooksTextSiteController } from "./books-text.site-controller";

/**
 * Контекст Authoring — 42 маршрута сайта `@SiteRoute` (`/api/...` и `/api/v1/site/...`):
 * структура и текст книги, фото и QR-файлы, экспорт/предпросмотр/сборка/обложки, ИИ-помощники, потоковые медиа и шрифты.
 */
@Module({
  controllers: [
    BooksTextSiteController,
    BooksMediaSiteController,
    BooksBuildSiteController,
    BooksAiSiteController,
    AuthoringMediaSiteController,
  ],
  providers: [SiteBookAccessService],
})
export class AuthoringSiteModule implements OnModuleInit {
  constructor(@Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost) {}

  /**
   * Парсер `application/octet-stream` для кусков загрузки `PUT /api/books/{id}/files/{fileId}`:
   * передаёт поток без буферизации до guard-ов (401/403/404/409/413 срабатывают до чтения байтов тела).
   */
  onModuleInit() {
    const fastify = this.adapterHost.httpAdapter?.getInstance<FastifyInstance>();
    if (fastify && !fastify.hasContentTypeParser("application/octet-stream")) {
      fastify.addContentTypeParser("application/octet-stream", (_req, payload, done) => {
        done(null, payload);
      });
    }
  }
}
