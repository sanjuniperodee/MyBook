import { NextResponse } from "next/server";
import { api, apiStaff } from "@/server/api";
import { container } from "@/server/container";

export const dynamic = "force-dynamic";

export const GET = api(async (req) => {
  const staff = await apiStaff(req);
  return NextResponse.json(await container().reporting.live(staff.context), { headers: { "Cache-Control": "no-store" } });
});
