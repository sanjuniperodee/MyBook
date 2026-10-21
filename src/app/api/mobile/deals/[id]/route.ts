import { NextResponse } from "next/server";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";
import { mobileDealDetail } from "@/app/api/mobile/data";

export const dynamic = "force-dynamic";

/** Карточка сделки: данные, этапы, задачи, заметки, платежи, счета. */
export const GET = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "deals.view");
  const { id } = idParams(await params, "id");
  return NextResponse.json(await mobileDealDetail(staff, id));
});
