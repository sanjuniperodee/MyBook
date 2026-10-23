import { NextResponse } from "next/server";
import { toggleTaskAction } from "@/app/admin/actions";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";

export const dynamic = "force-dynamic";

/** Отметить задачу выполненной или вернуть. */
export const POST = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req);
  const { id } = idParams(await params, "id");
  await toggleTaskAction(id);
  return NextResponse.json({ ok: true });
});
