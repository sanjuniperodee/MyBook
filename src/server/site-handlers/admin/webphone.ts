import { api, apiStaff } from "@/server/api";
import { TelephonyError } from "@/modules/telephony";
import { container } from "@/server/container";

/** Ключ WebRTC-виджета Zadarma для текущего сотрудника (звонки прямо из браузера). */
export const GET = api(async (req) => {
  const staff = await apiStaff(req, "calls.make");
  try {
    return Response.json(await container().telephony.phone.webphoneKey(staff.user.sipExtension), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (TelephonyError.is(err)) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
});
