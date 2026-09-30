import { NextResponse } from "next/server";
import { api, apiStaff } from "@/lib/api";
import { getLive } from "@/lib/crm/live";

export const dynamic = "force-dynamic";

export const GET = api(async (req) => {
  const staff = await apiStaff(req);
  return NextResponse.json(await getLive(staff), { headers: { "Cache-Control": "no-store" } });
});
