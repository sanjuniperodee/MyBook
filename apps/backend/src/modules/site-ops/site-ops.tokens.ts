import type { Locale } from "@/i18n/config";
import type { CurrentUser } from "@/modules/identity";
import type { StaffMember } from "../../core/auth/staff";

/** Порт Контекста 7B («деньги сайта, вебхуки интеграций, звонки WhatsApp, файлы заказа» — 32 маршрута сайта). */
export const SITE_OPS_PORTS = Symbol("SiteOpsPorts");

/** Маршрут контекста 7B: «МЕТОД путь» — как у маршрута сайта (src/server/site-handlers). */
export type SiteOpsRoute =
  | "POST /api/payments/kaspi/webhook"
  | "POST /api/payments/kaspi/invoices"
  | "GET /api/payments/kaspi/invoices/{id}"
  | "DELETE /api/payments/kaspi/invoices/{id}"
  | "POST /api/payments/cloudpayments/{event}"
  | "GET /api/orders/{id}/files/{kind}"
  | "GET /api/orders/{id}/render-progress"
  | "POST /api/admin/deals/{id}/payments"
  | "POST /api/admin/deals/{id}/receipts"
  | "GET /api/admin/gifts/{id}/receipt"
  | "POST /api/admin/gifts/{id}/receipt"
  | "GET /api/admin/order-payments/{id}/receipt"
  | "POST /api/admin/orders/{id}/payments"
  | "POST /api/admin/orders/{id}/refunds"
  | "DELETE /api/admin/payments/{id}"
  | "GET /api/admin/receipts/{id}"
  | "POST /api/integrations/email"
  | "GET /api/integrations/google/callback"
  | "GET /api/integrations/google/connect"
  | "POST /api/integrations/google/webhook"
  | "POST /api/integrations/gowa"
  | "POST /api/integrations/pbx"
  | "POST /api/integrations/wazzup"
  | "GET /api/integrations/zadarma"
  | "POST /api/integrations/zadarma"
  | "GET /api/admin/calls/whatsapp/audio-auth"
  | "GET /api/admin/calls/whatsapp/listen-auth"
  | "GET /api/admin/calls/whatsapp/live"
  | "POST /api/admin/calls/whatsapp/{id}"
  | "POST /api/admin/calls/whatsapp/{id}/recording"
  | "GET /api/admin/calls/{id}/recording"
  | "GET /api/admin/webphone";

/** Кто вызывает (вход и сотрудник — по сессии, без отказа: решает сам обработчик сайта), IP, язык. */
export interface SiteOpsCallMeta {
  user: CurrentUser | null;
  staff: StaffMember | null;
  token: string | null;
  ip: string;
  locale: Locale;
}

export interface SiteOpsPorts {
  /** Выполнить обработчик сайта маршрута: запрос — Web Request с телом как пришло, параметры пути — по именам. */
  handle(meta: SiteOpsCallMeta, route: SiteOpsRoute, req: Request, params: Record<string, string>): Promise<Response>;
}
