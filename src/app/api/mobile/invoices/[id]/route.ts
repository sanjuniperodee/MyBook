import { NextResponse } from "next/server";
import { z } from "zod";
import { cancelInvoiceAction, resendInvoiceAction } from "@/app/admin/invoices/actions";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";

export const dynamic = "force-dynamic";

/** Действие над счётом: { action: "cancel" | "resend" } — отменить или отправить клиенту ещё раз. */
export const POST = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req, "deals.edit");
  const { id } = idParams(await params, "id");
  const { action } = z.object({ action: z.enum(["cancel", "resend"]) }).parse(await req.json());
  const r = action === "cancel" ? await cancelInvoiceAction(id) : await resendInvoiceAction(id);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
});
