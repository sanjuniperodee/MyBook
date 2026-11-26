import { NextResponse } from "next/server";
import { api, apiStaff } from "@/server/api";
import { iosStatus } from "@/server/ios-app";

/** Телефоны сотрудника и готова ли для них сборка — страница «Приложение для телефона» спрашивает, пока ждёт регистрацию. */
export const GET = api(async (req) => {
  const staff = await apiStaff(req);
  return NextResponse.json(await iosStatus(staff.user.id), { headers: { "Cache-Control": "no-store" } });
});
