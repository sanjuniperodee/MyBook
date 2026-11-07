import { NextResponse } from "next/server";
import { z } from "zod";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";
import { assignDealAction } from "@/app/admin/deals/actions";

export const dynamic = "force-dynamic";

/** Назначить ответственного по сделке ({ userId } или null). */
export const POST = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req, "deals.edit");
  const { id } = idParams(await params, "id");
  const { userId } = z.object({ userId: z.string().uuid().nullable() }).parse(await req.json());
  const r = await assignDealAction(id, userId);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.message }, { status: 400 });
});
