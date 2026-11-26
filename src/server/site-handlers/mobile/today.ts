import { NextResponse } from "next/server";
import { apiStaff } from "@/server/api";
import { mobile } from "@/server/mobile-api";
import { mobileToday } from "@/server/crm-lists/work";

/** «Мой день»: плитки с числами, план месяца и первые строки списков — что горит прямо сейчас. */
export const GET = mobile(async (req) => {
  const staff = await apiStaff(req);
  return NextResponse.json(await mobileToday(staff));
});
