import { NextResponse } from "next/server";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";
import { acceptDealAction } from "@/app/admin/deals/actions";

export const dynamic = "force-dynamic";

/** Принять неразобранную заявку в работу (вместе с её диалогами). */
export const POST = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req, "deals.edit");
  const { id } = idParams(await params, "id");
  const r = await acceptDealAction(id);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.message }, { status: 400 });
});
