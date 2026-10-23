import { NextResponse } from "next/server";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";
import { markCallHandledAction } from "@/app/admin/crm-actions";

export const dynamic = "force-dynamic";

/** Пропущенный звонок обработан (перезвонили, написали). */
export const POST = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req, "calls.view");
  const { id } = idParams(await params, "id");
  const r = await markCallHandledAction(id);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
});
