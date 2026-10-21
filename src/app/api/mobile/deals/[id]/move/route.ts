import { NextResponse } from "next/server";
import { z } from "zod";
import { moveDealAction } from "@/app/admin/deals/actions";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";

export const dynamic = "force-dynamic";

/** Перенести сделку на этап: { stageId, lostReason? } (для «отказа» причина обязательна). */
export const POST = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req, "deals.edit");
  const { id } = idParams(await params, "id");
  const b = z.object({ stageId: z.string().uuid(), lostReason: z.string().max(200).optional() }).parse(await req.json());
  await moveDealAction(id, b.stageId, b.lostReason);
  return NextResponse.json({ ok: true });
});
