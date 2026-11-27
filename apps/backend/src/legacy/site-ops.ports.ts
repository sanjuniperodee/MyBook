import type { Provider } from "@nestjs/common";
import * as h_payments_kaspi_webhook from "@/server/site-handlers/payments/kaspi-webhook";
import * as h_payments_kaspi_invoices from "@/server/site-handlers/payments/kaspi-invoices";
import * as h_payments_kaspi_invoice_item from "@/server/site-handlers/payments/kaspi-invoice-item";
import * as h_payments_cloudpayments_webhook from "@/server/site-handlers/payments/cloudpayments-webhook";
import * as h_orders_file from "@/server/site-handlers/orders/file";
import * as h_orders_render_progress from "@/server/site-handlers/orders/render-progress";
import * as h_admin_deals_id_payments from "@/server/site-handlers/admin/deals-id-payments";
import * as h_admin_deals_id_receipts from "@/server/site-handlers/admin/deals-id-receipts";
import * as h_admin_gifts_id_receipt from "@/server/site-handlers/admin/gifts-id-receipt";
import * as h_admin_order_payments_id_receipt from "@/server/site-handlers/admin/order-payments-id-receipt";
import * as h_admin_orders_id_payments from "@/server/site-handlers/admin/orders-id-payments";
import * as h_admin_orders_id_refunds from "@/server/site-handlers/admin/orders-id-refunds";
import * as h_admin_payments_id from "@/server/site-handlers/admin/payments-id";
import * as h_admin_receipts_id from "@/server/site-handlers/admin/receipts-id";
import * as h_integrations_email from "@/server/site-handlers/integrations/email";
import * as h_integrations_google_callback from "@/server/site-handlers/integrations/google-callback";
import * as h_integrations_google_connect from "@/server/site-handlers/integrations/google-connect";
import * as h_integrations_google_webhook from "@/server/site-handlers/integrations/google-webhook";
import * as h_integrations_gowa from "@/server/site-handlers/integrations/gowa";
import * as h_integrations_pbx from "@/server/site-handlers/integrations/pbx";
import * as h_integrations_wazzup from "@/server/site-handlers/integrations/wazzup";
import * as h_integrations_zadarma from "@/server/site-handlers/integrations/zadarma";
import * as h_admin_calls_whatsapp_audio_auth from "@/server/site-handlers/admin/calls-whatsapp-audio-auth";
import * as h_admin_calls_whatsapp_listen_auth from "@/server/site-handlers/admin/calls-whatsapp-listen-auth";
import * as h_admin_calls_whatsapp_live from "@/server/site-handlers/admin/calls-whatsapp-live";
import * as h_admin_calls_whatsapp_id from "@/server/site-handlers/admin/calls-whatsapp-id";
import * as h_admin_calls_whatsapp_id_recording from "@/server/site-handlers/admin/calls-whatsapp-id-recording";
import * as h_admin_calls_id_recording from "@/server/site-handlers/admin/calls-id-recording";
import * as h_admin_webphone from "@/server/site-handlers/admin/webphone";
import { SITE_OPS_PORTS, type SiteOpsPorts, type SiteOpsRoute } from "../modules/site-ops/site-ops.tokens";
import { requestContext } from "@/shared/infrastructure/http/request-scope";
import { runInLegacyRequest } from "./legacy-request";

/** Обработчик маршрута сайта; объявлен методом, чтобы принять обработчики с узким типом параметров пути ({ id }, { event }). */
type SiteHandler = { call(req: Request, ctx: { params: Promise<Record<string, string>> }): Promise<Response> | Response }["call"];

/** Обработчики сайта маршрутов 7B — модули src/server/site-handlers. */
const HANDLERS: Record<SiteOpsRoute, SiteHandler> = {
  "POST /api/payments/kaspi/webhook": h_payments_kaspi_webhook.POST,
  "POST /api/payments/kaspi/invoices": h_payments_kaspi_invoices.POST,
  "GET /api/payments/kaspi/invoices/{id}": h_payments_kaspi_invoice_item.GET,
  "DELETE /api/payments/kaspi/invoices/{id}": h_payments_kaspi_invoice_item.DELETE,
  "POST /api/payments/cloudpayments/{event}": h_payments_cloudpayments_webhook.POST,
  "GET /api/orders/{id}/files/{kind}": h_orders_file.GET,
  "GET /api/orders/{id}/render-progress": h_orders_render_progress.GET,
  "POST /api/admin/deals/{id}/payments": h_admin_deals_id_payments.POST,
  "POST /api/admin/deals/{id}/receipts": h_admin_deals_id_receipts.POST,
  "GET /api/admin/gifts/{id}/receipt": h_admin_gifts_id_receipt.GET,
  "POST /api/admin/gifts/{id}/receipt": h_admin_gifts_id_receipt.POST,
  "GET /api/admin/order-payments/{id}/receipt": h_admin_order_payments_id_receipt.GET,
  "POST /api/admin/orders/{id}/payments": h_admin_orders_id_payments.POST,
  "POST /api/admin/orders/{id}/refunds": h_admin_orders_id_refunds.POST,
  "DELETE /api/admin/payments/{id}": h_admin_payments_id.DELETE,
  "GET /api/admin/receipts/{id}": h_admin_receipts_id.GET,
  "POST /api/integrations/email": h_integrations_email.POST,
  "GET /api/integrations/google/callback": h_integrations_google_callback.GET,
  "GET /api/integrations/google/connect": h_integrations_google_connect.GET,
  "POST /api/integrations/google/webhook": h_integrations_google_webhook.POST,
  "POST /api/integrations/gowa": h_integrations_gowa.POST,
  "POST /api/integrations/pbx": h_integrations_pbx.POST,
  "POST /api/integrations/wazzup": h_integrations_wazzup.POST,
  "GET /api/integrations/zadarma": h_integrations_zadarma.GET,
  "POST /api/integrations/zadarma": h_integrations_zadarma.POST,
  "GET /api/admin/calls/whatsapp/audio-auth": h_admin_calls_whatsapp_audio_auth.GET,
  "GET /api/admin/calls/whatsapp/listen-auth": h_admin_calls_whatsapp_listen_auth.GET,
  "GET /api/admin/calls/whatsapp/live": h_admin_calls_whatsapp_live.GET,
  "POST /api/admin/calls/whatsapp/{id}": h_admin_calls_whatsapp_id.POST,
  "POST /api/admin/calls/whatsapp/{id}/recording": h_admin_calls_whatsapp_id_recording.POST,
  "GET /api/admin/calls/{id}/recording": h_admin_calls_id_recording.GET,
  "GET /api/admin/webphone": h_admin_webphone.GET,
};

/**
 * Адаптер порта Контекста 7B: обработчик сайта выполняется внутри `runInLegacyRequest` — getCurrentUser(), getStaff()
 * (с правилами IP и 2FA), язык и IP клиента у него те же, что определил Nest, без `next/headers`. Вход, права, подписи
 * вебхуков и ответы — его собственные, как в mybook-api.
 */
export const legacySiteOpsPorts: Provider<SiteOpsPorts> = {
  provide: SITE_OPS_PORTS,
  useFactory: (): SiteOpsPorts => ({
    handle: (meta, route, req, params) => runInLegacyRequest(meta, () => runWithAfter(req, () => HANDLERS[route](req, { params: Promise.resolve(params) }))),
  }),
};

/**
 * `after()` (src/shared/infrastructure/http; вебхук GOWA: фото профиля нового клиента) — задача после ответа. Вне области
 * запроса он бросает «вызов вне HTTP-запроса»: вебхук падал посреди обработки (статусы, правки, удаления пачки терялись, шлюзу —
 * 500). Задачи копятся в области запроса и запускаются фоном, когда обработчик вернул ответ; сбой задачи — только в лог.
 */
async function runWithAfter(req: Request, fn: () => Response | Promise<Response>): Promise<Response> {
  const scope = { request: req, afterResponse: [] as (() => unknown)[] };
  const res = await requestContext.run(scope, fn);
  for (const task of scope.afterResponse) {
    setImmediate(() => {
      void Promise.resolve()
        .then(task)
        .catch((err: unknown) => console.error("[site-ops] after()", err));
    });
  }
  return res;
}
