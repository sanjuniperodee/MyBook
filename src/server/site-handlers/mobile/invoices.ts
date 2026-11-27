import { issueInvoiceAction } from "@/server/crm-actions/invoices";
import { apiStaff } from "@/server/api";
import { mobile } from "@/server/mobile-api";

/** Выставить счёт из чата или сделки (поля — как в форме CRM; issueKey защищает от двойного нажатия). */
export const POST = mobile(async (req) => {
  await apiStaff(req, "chats.send", "deals.edit");
  const r = await issueInvoiceAction(await req.json());
  return Response.json(r, { status: r.ok ? 200 : 400 });
});
