import QRCode from "qrcode";
import type { PaymentInvoice, PaymentTarget } from "@/modules/ordering";
import { container } from "@/server/container";
import type { KaspiInvoiceView } from "@/modules/ordering/ui/kaspi";

/** Ссылку из ответа Kaspi отдаём в браузер, только если она ведёт в Kaspi (https://*.kaspi.kz или kaspi://). */
function kaspiLink(url: string | null) {
  if (!url) return null;
  if (/^kaspi:/i.test(url)) return url;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "kaspi.kz" || u.hostname.endsWith(".kaspi.kz")) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Счёт для страницы оплаты: статус, ссылка в Kaspi, QR-код картинкой (SVG) и срок. */
export async function invoiceView(invoice: PaymentInvoice): Promise<KaspiInvoiceView> {
  const s = invoice.snapshot();
  return {
    id: s.id,
    method: s.method,
    status: s.status,
    amount: s.amount,
    phone: s.phone,
    link: kaspiLink(s.checkoutUrl),
    qrSvg: s.method === "qr" && s.qrToken && s.status === "pending" ? await QRCode.toString(s.qrToken, { type: "svg", margin: 1, errorCorrectionLevel: "M" }) : null,
    expiresAt: s.expiresAt?.toISOString() ?? null,
    paidAt: s.paidAt?.toISOString() ?? null,
  };
}

/** Данные для блока оплаты через Kaspi на странице заказа или сертификата; null — Kaspi не подключён. */
export async function kaspiPaymentProps(target: PaymentTarget, defaultPhone: string) {
  const kaspi = container().ordering.kaspi;
  if (!(await kaspi.available())) return null;
  const current = await kaspi.current(target);
  return { initial: current ? await invoiceView(current) : null, defaultPhone };
}
