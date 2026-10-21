import { NextResponse } from "next/server";
import { apiStaff } from "@/server/api";
import { mobile } from "@/server/mobile-api";
import { mobileStaff } from "@/app/api/mobile/work";

export const dynamic = "force-dynamic";

/** Сотрудники для выбора ответственного; «только свои» видят только себя. */
export const GET = mobile(async (req) => {
  const staff = await apiStaff(req);
  return NextResponse.json(await mobileStaff(staff));
});
