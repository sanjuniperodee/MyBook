import QRCode from "qrcode";
import { kaspiPhone, type PaymentInvoice, type PaymentTarget } from "@/modules/ordering";
import { maskPhone } from "@/modules/access";
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

/**
 * Счёт для страницы оплаты: статус, ссылка в Kaspi, QR-код картинкой (SVG) и срок. Счёт из чата открывают по ссылке
 * без входа (её могли переслать) — номер в нём только с маской: +7 701 ••• •• 67.
 */
export async function invoiceView(invoice: PaymentInvoice): Promise<KaspiInvoiceView> {
  const s = invoice.snapshot();
  return {
    id: s.id,
    method: s.method,
    status: s.status,
    amount: s.amount,
    phone: s.target.kind === "deal_invoice" && s.phone ? maskPhone(s.phone) : s.phone,
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

/**
 * Блок Kaspi на странице счёта из чата: поле номера пустое (полный номер клиента в браузер не уходит) — пустое поле
 * значит «номер из счёта», он показан с маской; получатель — организация кассира Kaspi. null — Kaspi не подключён.
 */
export async function dealInvoiceKaspiProps(invoiceId: string, phone: string | null) {
  const ordering = container().ordering;
  if (!(await ordering.kaspi.available())) return null;
  const [current, recipient] = await Promise.all([ordering.kaspi.current({ kind: "deal_invoice", id: invoiceId }), ordering.kaspiRecipient()]);
  // Номер чата не годится для Kaspi (не казахстанский мобильный) — клиент вводит свой.
  const own = kaspiPhone(phone);
  return { initial: current ? await invoiceView(current) : null, defaultPhone: "", maskedPhone: own ? maskPhone(own) : null, recipient };
}
