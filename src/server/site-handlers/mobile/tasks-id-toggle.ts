import { NextResponse } from "next/server";
import { toggleTaskAction } from "@/server/crm-actions/admin";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";

/** Отметить задачу выполненной или вернуть. */
export const POST = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req);
  const { id } = idParams(await params, "id");
  const r = await toggleTaskAction(id);
  return r.error ? NextResponse.json({ error: r.error }, { status: 400 }) : NextResponse.json({ ok: true });
});
