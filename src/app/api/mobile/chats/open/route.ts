import { NextResponse } from "next/server";
import { z } from "zod";
import { apiStaff } from "@/server/api";
import { mobile } from "@/server/mobile-api";
import { openChatAction } from "@/app/admin/crm-actions";

export const dynamic = "force-dynamic";

/** Открыть чат WhatsApp с клиентом по сделке, заказу или клиенту (существующий или новый): { dealId | orderId | clientId } → { id }. */
export const POST = mobile(async (req) => {
  await apiStaff(req, "chats.send");
  const t = z.object({ dealId: z.string().uuid().nullish(), orderId: z.string().uuid().nullish(), clientId: z.string().uuid().nullish(), callId: z.string().uuid().nullish() }).parse(await req.json());
  const r = await openChatAction({ dealId: t.dealId ?? undefined, orderId: t.orderId ?? undefined, clientId: t.clientId ?? undefined, callId: t.callId ?? undefined });
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
});
