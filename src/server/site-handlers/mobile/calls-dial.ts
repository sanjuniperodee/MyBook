import { NextResponse } from "next/server";
import { z } from "zod";
import { apiStaff } from "@/server/api";
import { mobile } from "@/server/mobile-api";
import { callAction } from "@/server/crm-actions/crm";

/** Звонок через АТС: сначала зазвонит телефон сотрудника, затем АТС соединит с клиентом. Номер берётся на сервере. */
export const POST = mobile(async (req) => {
  await apiStaff(req, "calls.make");
  const t = z.object({ dealId: z.string().uuid().nullish(), orderId: z.string().uuid().nullish(), clientId: z.string().uuid().nullish(), callId: z.string().uuid().nullish() }).parse(await req.json());
  const r = await callAction({ dealId: t.dealId ?? undefined, orderId: t.orderId ?? undefined, clientId: t.clientId ?? undefined, callId: t.callId ?? undefined });
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
});
