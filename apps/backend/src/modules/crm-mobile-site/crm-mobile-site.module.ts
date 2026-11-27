import { Inject, Module, type OnModuleInit } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { FastifyInstance } from "fastify";
import { MobileAppDistSiteController } from "./mobile-app-dist.site-controller";
import { MobileAuthWorkSiteController } from "./mobile-auth-work.site-controller";
import { MobileChatsSiteController } from "./mobile-chats.site-controller";
import { MobileDealsClientsSiteController } from "./mobile-deals-clients.site-controller";

const RAW_BINARY_CONTENT_TYPES = [
  "application/pkcs7-signature",
  "application/x-pkcs7-signature",
  "application/xml",
  "text/xml",
] as const;

/**
 * Контекст 6 («CRM-mobile»): все 77 маршрутов сайта `@SiteRoute` (`/api/...` и `/api/v1/site/...`) —
 * 7 маршрутов раздачи APK и iPhone Ad Hoc + 70 маршрутов старого мобильного приложения `/api/mobile/*`.
 */
@Module({
  controllers: [
    MobileAppDistSiteController,
    MobileAuthWorkSiteController,
    MobileDealsClientsSiteController,
    MobileChatsSiteController,
  ],
})
export class CrmMobileSiteModule implements OnModuleInit {
  constructor(@Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost) {}

  /**
   * Парсеры сырых бинарных тел PKCS#7 и XML для `POST /api/ios-app/udid` (профиль регистрации iOS):
   * сохраняют точные байты в `req.rawBody` без 415 Unsupported Media Type и без порчи двоичной подписи.
   */
  onModuleInit() {
    const fastify = this.adapterHost.httpAdapter?.getInstance<FastifyInstance>();
    if (!fastify) return;
    for (const type of RAW_BINARY_CONTENT_TYPES) {
      if (!fastify.hasContentTypeParser(type)) {
        fastify.addContentTypeParser(type, { parseAs: "buffer" }, (req, body, done) => {
          const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
          req.rawBody = buf;
          done(null, buf);
        });
      }
    }
    if (!fastify.hasContentTypeParser("application/octet-stream")) {
      fastify.addContentTypeParser("application/octet-stream", (_req, payload, done) => {
        done(null, payload);
      });
    }
  }
}
