import { NextResponse } from "next/server";
import { z } from "zod";
import { apiStaff } from "@/server/api";
import { mobile } from "@/server/mobile-api";
import { setShiftAction } from "@/app/admin/crm-actions";

export const dynamic = "force-dynamic";

/** Выйти на смену или уйти со смены ({ onShift }): на смене сотрудник получает новые заявки по кругу. */
export const POST = mobile(async (req) => {
  await apiStaff(req);
  const { onShift } = z.object({ onShift: z.boolean() }).parse(await req.json());
  await setShiftAction(onShift);
  return NextResponse.json({ ok: true, onShift });
});
