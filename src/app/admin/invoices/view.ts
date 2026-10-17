import "server-only";
import { formatDate } from "@/lib/dates";
import type { DealInvoice } from "@/modules/ordering";
import type { InvoiceView } from "@/components/admin/invoices/model";

import { payLink } from "@/server/deal-invoices";

export { payLink };

/**
 * Счета сделки для блока «Счета» (страница сделки, карточка сделки в чате). Ссылка на оплату — только тем, кто ведёт
 * сделку (withLink): по ней платят, в чужие руки её не отдаём.
 */
export function invoiceViews(invoices: DealInvoice[], opts: { now: Date; withLink: boolean }): InvoiceView[] {
  return invoices.map((invoice) => {
    const s = invoice.snapshot();
    return {
      id: invoice.id,
      label: invoice.label,
      amount: s.amount,
      purpose: s.purpose,
      status: s.status,
      overdue: s.status === "pending_payment" && s.expiresAt <= opts.now,
      expiresLabel: formatDate(s.expiresAt, true),
      paidLabel: s.paidAt ? formatDate(s.paidAt, true) : null,
      paidMethod: s.paidMethod,
      paidRef: s.paidMethod === "manual" ? null : s.paidRef,
      closedReason: s.closedReason,
      claimedLabel: s.claimedAt ? formatDate(s.claimedAt, true) : null,
      access: s.accessStatus,
      hasChat: !!s.conversationId,
      link: opts.withLink && s.status === "pending_payment" ? payLink(invoice) : null,
    };
  });
}
