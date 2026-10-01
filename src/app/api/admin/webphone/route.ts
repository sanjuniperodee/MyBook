import { NextResponse } from "next/server";
import { api, apiStaff } from "@/lib/api";
import { TelephonyError, webphoneKey } from "@/lib/crm/telephony";

/** Ключ WebRTC-виджета Zadarma для текущего сотрудника (звонки прямо из браузера). */
export const GET = api(async (req) => {
  const staff = await apiStaff(req, "calls.make");
  try {
    return NextResponse.json(await webphoneKey(staff.user.sipExtension), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof TelephonyError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
});
