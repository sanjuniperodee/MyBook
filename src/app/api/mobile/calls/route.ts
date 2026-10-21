import { NextResponse } from "next/server";
import { apiStaff } from "@/server/api";
import { mobile } from "@/server/mobile-api";
import { mobileCalls } from "@/app/api/mobile/work";

export const dynamic = "force-dynamic";

/** Журнал звонков: ?f=missed|all|in|out|mine&days=14. Номера — с учётом права видеть контакты. */
export const GET = mobile(async (req) => {
  const staff = await apiStaff(req, "calls.view");
  const u = new URL(req.url).searchParams;
  const f = u.get("f");
  const filter = f === "missed" || f === "in" || f === "out" || f === "mine" ? f : "all";
  return NextResponse.json(await mobileCalls(staff, filter, Math.min(60, Math.max(1, Number(u.get("days")) || 14))));
});
