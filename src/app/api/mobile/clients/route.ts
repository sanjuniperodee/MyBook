import { NextResponse } from "next/server";
import { apiStaff } from "@/server/api";
import { mobile } from "@/server/mobile-api";
import { mobileClients } from "@/app/api/mobile/work";

export const dynamic = "force-dynamic";

/** Клиенты: ?q=имя, e-mail или телефон; sort=new|ltv|active; mine=1; page. */
export const GET = mobile(async (req) => {
  const staff = await apiStaff(req, "clients.view");
  const u = new URL(req.url).searchParams;
  const sort = u.get("sort");
  return NextResponse.json(await mobileClients(staff, { q: u.get("q")?.slice(0, 100) ?? undefined, sort: sort === "ltv" || sort === "active" ? sort : "new", page: Math.max(1, Number(u.get("page")) || 1), mine: u.get("mine") === "1" }));
});
