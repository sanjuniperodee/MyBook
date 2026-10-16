import type { KaspiMethod, PaymentInvoiceStatus } from "../domain";

/** Счёт Kaspi для страницы оплаты (ответ /api/payments/kaspi/invoices). Без серверных зависимостей — для клиентских компонентов. */
export interface KaspiInvoiceView {
  id: string;
  method: KaspiMethod;
  status: PaymentInvoiceStatus;
  amount: number;
  phone: string | null;
  /** Ссылка в Kaspi (https://*.kaspi.kz или kaspi://) — только проверенная. */
  link: string | null;
  /** QR-код картинкой (SVG), пока QR-счёт ждёт оплаты. */
  qrSvg: string | null;
  expiresAt: string | null;
  paidAt: string | null;
}

