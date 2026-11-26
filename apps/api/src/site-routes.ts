/**
 * Маршруты сайта, которые обслуживает mybook-api (ADR 0012):
 *   - вебхуки провайдеров (A6): без входа, формат задаёт провайдер, подпись проверяет маршрут;
 *   - маршруты страниц сайта (A5, душитель): доступны как по `/api/...` (через nginx `mybook_api_first`),
 *     так и по `/api/v1/site/...` (через потоковый прокси Next `v1SiteProxy`).
 * Обработчики Раздела 2 (книга и медиа) вынесены в `src/server/site-handlers/**`, чтобы `src/app/api/**`
 * был тонкой прокси-обёрткой без петли прокси.
 */
import * as kaspi from "@/server/site-handlers/payments/kaspi-webhook";
import * as kaspiInvoices from "@/server/site-handlers/payments/kaspi-invoices";
import * as kaspiInvoiceItem from "@/server/site-handlers/payments/kaspi-invoice-item";
import * as cloudpayments from "@/server/site-handlers/payments/cloudpayments-webhook";
import * as orderFile from "@/server/site-handlers/orders/file";
import * as orderRenderProgress from "@/server/site-handlers/orders/render-progress";
import * as giftPdf from "@/server/site-handlers/public/gift-pdf";
import * as letterSubmit from "@/server/site-handlers/public/letter-submit";
import * as reviewSubmit from "@/server/site-handlers/public/review-submit";
import * as reviewPhoto from "@/server/site-handlers/public/review-photo";
import * as siteChat from "@/server/site-handlers/public/site-chat";
import * as siteCallback from "@/server/site-handlers/public/site-callback";
import * as calendarFeed from "@/server/site-handlers/public/calendar-feed";
import * as chatAvatar from "@/server/site-handlers/public/chat-avatar";
import * as inviteLink from "@/server/site-handlers/public/invite-link";
import * as shortLink from "@/server/site-handlers/public/short-link";
import * as gowa from "@/app/api/integrations/gowa/route";
import * as zadarma from "@/app/api/integrations/zadarma/route";
import * as google from "@/app/api/integrations/google/webhook/route";
import * as live from "@/app/api/admin/live/route";
import * as chatsInbox from "@/app/api/admin/chats/inbox/route";
import * as chatMessages from "@/app/api/admin/chats/[id]/messages/route";
import * as adminNotifications from "@/app/api/admin/notifications/route";
import * as bookRoute from "@/server/site-handlers/books/book";
import * as build from "@/server/site-handlers/books/build";
import * as buildProgress from "@/server/site-handlers/books/build-progress";
import * as chapters from "@/server/site-handlers/books/chapters";
import * as chaptersOrder from "@/server/site-handlers/books/chapters-order";
import * as chaptersMove from "@/server/site-handlers/books/chapters-move";
import * as chapterItem from "@/server/site-handlers/books/chapter-item";
import * as coverImage from "@/server/site-handlers/books/cover-image";
import * as coverThumb from "@/server/site-handlers/books/cover-thumb";
import * as designAi from "@/server/site-handlers/books/design-ai";
import * as bookExport from "@/server/site-handlers/books/export";
import * as bookFiles from "@/server/site-handlers/books/files";
import * as bookFileItem from "@/server/site-handlers/books/file-item";
import * as bookFilePacks from "@/server/site-handlers/books/files-packs";
import * as bookHelp from "@/server/site-handlers/books/help";
import * as bookLayout from "@/server/site-handlers/books/layout";
import * as lettersInvite from "@/server/site-handlers/books/letters-invite";
import * as lettersOrder from "@/server/site-handlers/books/letters-order";
import * as letterItem from "@/server/site-handlers/books/letter-item";
import * as pageRaster from "@/server/site-handlers/books/page-raster";
import * as pagesImage from "@/server/site-handlers/books/pages-image";
import * as photos from "@/server/site-handlers/books/photos";
import * as photosOrder from "@/server/site-handlers/books/photos-order";
import * as photosBatch from "@/server/site-handlers/books/photos-batch";
import * as photoItem from "@/server/site-handlers/books/photo-item";
import * as photoEdit from "@/server/site-handlers/books/photo-edit";
import * as photoRotate from "@/server/site-handlers/books/photo-rotate";
import * as bookPreview from "@/server/site-handlers/books/preview";
import * as proofreadAi from "@/server/site-handlers/books/proofread-ai";
import * as spell from "@/server/site-handlers/books/proofread-spell";
import * as questions from "@/server/site-handlers/books/questions";
import * as questionsOrder from "@/server/site-handlers/books/questions-order";
import * as questionMove from "@/server/site-handlers/books/question-move";
import * as questionSave from "@/server/site-handlers/books/question-item";
import * as writeAi from "@/server/site-handlers/books/write-ai";
import * as mediaPhoto from "@/server/site-handlers/media/photo";
import * as mediaCover from "@/server/site-handlers/media/cover";
import * as mediaCoverPhoto from "@/server/site-handlers/media/cover-photo";

/** Обработчик маршрута Next: второй аргумент — { params } своего вида у каждого маршрута. */
type RouteHandler = (req: Request, ctx: never) => Promise<Response> | Response;
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type RouteModule = Partial<Record<Method, RouteHandler>>;

/** Путь с параметрами в фигурных скобках → модуль маршрута сайта. */
const table: [string, RouteModule][] = [
  ["/api/payments/kaspi/webhook", kaspi as RouteModule],
  ["/api/payments/kaspi/invoices/{id}", kaspiInvoiceItem as RouteModule],
  ["/api/payments/kaspi/invoices", kaspiInvoices as RouteModule],
  ["/api/payments/cloudpayments/{event}", cloudpayments as RouteModule],
  ["/api/orders/{id}/files/{kind}", orderFile as RouteModule],
  ["/api/orders/{id}/render-progress", orderRenderProgress as RouteModule],
  // Публичные страницы (Раздел 4): сертификат, письма близких по ссылке, отзывы, чат сайта, iCal, ссылки /r и /go.
  ["/api/gifts/{token}/pdf", giftPdf as RouteModule],
  ["/api/letters/{token}", letterSubmit as RouteModule],
  ["/api/reviews/photo/{id}", reviewPhoto as RouteModule],
  ["/api/reviews/{orderId}", reviewSubmit as RouteModule],
  ["/api/chat/callback", siteCallback as RouteModule],
  ["/api/chat", siteChat as RouteModule],
  ["/api/calendar/{token}", calendarFeed as RouteModule],
  ["/api/chat-avatar/{file}", chatAvatar as RouteModule],
  // /r/<код> и /go/<ссылка> вне /api: прокси шлёт их на /api/v1/site/r/… и /api/v1/site/go/….
  ["/api/r/{code}", inviteLink as RouteModule],
  ["/api/go/{slug}", shortLink as RouteModule],
  ["/api/integrations/gowa", gowa as RouteModule],
  ["/api/integrations/zadarma", zadarma as RouteModule],
  ["/api/integrations/google/webhook", google as RouteModule],
  // Автосохранение ответа и удаление своего раздела — самый частый маршрут редактора (~17 тыс. в сутки).
  // Статические подмаршруты (/order, /move, /batch, /invite, /packs) идут раньше параметрических ({qid}, {key}, {pid}, {lid}, {fileId}).
  ["/api/books/{id}/questions/order", questionsOrder as RouteModule],
  ["/api/books/{id}/questions/{qid}/move", questionMove as RouteModule],
  ["/api/books/{id}/questions/{qid}", questionSave as RouteModule],
  ["/api/books/{id}/questions", questions as RouteModule],
  // Редактор: главы, фото (загрузка, порядок, правка, пакет, редактор, поворот, раскладка), письма близких, файлы, превью, ИИ, настройки книги.
  ["/api/books/{id}/chapters/order", chaptersOrder as RouteModule],
  ["/api/books/{id}/chapters/move", chaptersMove as RouteModule],
  ["/api/books/{id}/chapters/{key}", chapterItem as RouteModule],
  ["/api/books/{id}/chapters", chapters as RouteModule],
  ["/api/books/{id}/photos/order", photosOrder as RouteModule],
  ["/api/books/{id}/photos/batch", photosBatch as RouteModule],
  ["/api/books/{id}/photos/{pid}/edit", photoEdit as RouteModule],
  ["/api/books/{id}/photos/{pid}/rotate", photoRotate as RouteModule],
  ["/api/books/{id}/photos/{pid}", photoItem as RouteModule],
  ["/api/books/{id}/photos", photos as RouteModule],
  ["/api/books/{id}/layout", bookLayout as RouteModule],
  ["/api/books/{id}/letters/invite", lettersInvite as RouteModule],
  ["/api/books/{id}/letters/order", lettersOrder as RouteModule],
  ["/api/books/{id}/letters/{lid}", letterItem as RouteModule],
  ["/api/books/{id}/files/packs", bookFilePacks as RouteModule],
  ["/api/books/{id}/files/{fileId}", bookFileItem as RouteModule],
  ["/api/books/{id}/files", bookFiles as RouteModule],
  ["/api/books/{id}/export", bookExport as RouteModule],
  ["/api/books/{id}/preview", bookPreview as RouteModule],
  ["/api/books/{id}/pages/{fp}/{n}", pageRaster as RouteModule],
  ["/api/books/{id}/pages-image", pagesImage as RouteModule],
  ["/api/books/{id}/cover-image", coverImage as RouteModule],
  ["/api/books/{id}/cover-thumb/{template}", coverThumb as RouteModule],
  ["/api/books/{id}/help", bookHelp as RouteModule],
  ["/api/books/{id}/design-ai", designAi as RouteModule],
  ["/api/books/{id}/proofread/ai", proofreadAi as RouteModule],
  ["/api/books/{id}/proofread/spell", spell as RouteModule],
  ["/api/books/{id}/write/ai", writeAi as RouteModule],
  ["/api/books/{id}/build", build as RouteModule],
  ["/api/books/{id}/build-progress", buildProgress as RouteModule],
  ["/api/books/{id}", bookRoute as RouteModule],
  // Потоковые медиа книги и шаблонов обложек.
  ["/api/photos/{id}", mediaPhoto as RouteModule],
  ["/api/covers/{file}", mediaCover as RouteModule],
  ["/api/cover-photos/{key}", mediaCoverPhoto as RouteModule],
  // Частые JSON-маршруты CRM.
  ["/api/admin/live", live as RouteModule],
  ["/api/admin/chats/inbox", chatsInbox as RouteModule],
  ["/api/admin/chats/{id}/messages", chatMessages as RouteModule],
  ["/api/admin/notifications", adminNotifications as RouteModule],
];

const compiled = table.map(([path, module]) => ({ path, module, re: new RegExp(`^${path.replace(/\{(\w+)\}/g, "(?<$1>[^/]+)")}$`) }));

function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const digest = "digest" in err && typeof err.digest === "string" ? err.digest : "";
  if (digest === "NEXT_NOT_FOUND" || digest === "NEXT_HTTP_ERROR_FALLBACK;404") return true;
  return err instanceof Error && err.message === "NEXT_NOT_FOUND";
}

/** Адреса — для nginx и проверки выкатки. */
export const siteRoutePaths = table.map(([path]) => path);

/** Ответ маршрута сайта; null — это не его адрес. Поддерживает `/api/...` и `/api/v1/site/...`. */
export async function handleSiteRoute(req: Request): Promise<Response | null> {
  const { pathname: rawPathname } = new URL(req.url);
  const pathname = rawPathname.startsWith("/api/v1/site/") ? `/api/${rawPathname.slice("/api/v1/site/".length)}` : rawPathname;
  for (const { module, re } of compiled) {
    const m = re.exec(pathname);
    if (!m) continue;
    const handler = module[req.method as Method];
    if (!handler) return new Response(null, { status: 405, headers: { allow: Object.keys(module).filter((k) => /^(GET|POST|PUT|PATCH|DELETE)$/.test(k)).join(", ") } });
    try {
      return await handler(req, { params: Promise.resolve({ ...m.groups }) } as never);
    } catch (err) {
      if (isNotFoundError(err)) return new Response(null, { status: 404 });
      throw err;
    }
  }
  return null;
}
