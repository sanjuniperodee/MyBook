/**
 * CRM — счета сделки в API v1 (перенос /api/mobile/invoices*): те же действия, что у формы счёта в CRM на сайте (права,
 * проверки, лимит скидки, защита от двойного нажатия). Отказ действия — 400 refused с текстом для сотрудника.
 */
import { cancelInvoiceAction, invoiceFormInfoAction, issueInvoiceAction, resendInvoiceAction } from "@/app/admin/invoices/actions";
import { apiStaff } from "@/server/api";
import type { Handlers } from "../app";
import { refused } from "./crm/common";

export const crmInvoiceHandlers: Pick<Handlers, "crmInvoiceForm" | "crmInvoiceIssue" | "crmInvoiceCancel" | "crmInvoiceResend"> = {
  async crmInvoiceForm({ req, input }) {
    await apiStaff(req, "chats.send", "deals.edit");
    const r = await invoiceFormInfoAction({ dealId: input.dealId, conversationId: input.conversationId });
    return r.ok ? r.info : refused(r.message);
  },

  async crmInvoiceIssue({ req, input }) {
    await apiStaff(req, "chats.send", "deals.edit");
    const r = await issueInvoiceAction(input.body);
    return r.ok ? r : refused(r.message);
  },

  async crmInvoiceCancel({ req, input }) {
    await apiStaff(req, "deals.edit");
    const r = await cancelInvoiceAction(input.invoiceId);
    return r.ok ? { ok: true as const, message: r.message } : refused(r.message);
  },

  async crmInvoiceResend({ req, input }) {
    await apiStaff(req, "chats.send", "deals.edit");
    const r = await resendInvoiceAction(input.invoiceId);
    return r.ok ? r : refused(r.message);
  },
};
