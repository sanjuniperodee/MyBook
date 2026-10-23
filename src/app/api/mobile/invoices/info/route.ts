import { NextResponse } from "next/server";
import { invoiceFormInfoAction } from "@/app/admin/invoices/actions";
import { apiStaff } from "@/server/api";
import { mobile } from "@/server/mobile-api";

export const dynamic = "force-dynamic";

/** Что нужно форме счёта: договорённость из сделки, тарифы, способы оплаты, лимит скидки. ?dealId=&conversationId= */
export const GET = mobile(async (req) => {
  await apiStaff(req, "chats.send", "deals.edit");
  const url = new URL(req.url);
  const r = await invoiceFormInfoAction({ dealId: url.searchParams.get("dealId") ?? undefined, conversationId: url.searchParams.get("conversationId") ?? undefined });
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
});
