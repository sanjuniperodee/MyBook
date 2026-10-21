import { NextResponse } from "next/server";
import { apiStaff } from "@/server/api";
import { mobile } from "@/server/mobile-api";
import { mobileDeals } from "@/app/api/mobile/data";

export const dynamic = "force-dynamic";

/** Воронка и сделки: ?p=воронка&mine=1&a=ответственный|none&q=поиск&task=none|overdue&stale=дней. */
export const GET = mobile(async (req) => {
  const staff = await apiStaff(req, "deals.view");
  const url = new URL(req.url);
  const sp: Record<string, string | undefined> = {};
  for (const k of ["p", "mine", "a", "q", "task", "stale", "src"]) sp[k] = url.searchParams.get(k) ?? undefined;
  return NextResponse.json(await mobileDeals(staff, sp));
});
