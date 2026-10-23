import { NextResponse } from "next/server";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";
import { mobileClient } from "@/app/api/mobile/work";

export const dynamic = "force-dynamic";

/** Карточка клиента: контакты, покупки, книги, заказы, сделки, задачи, заметки. */
export const GET = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "clients.view");
  const { id } = idParams(await params, "id");
  return NextResponse.json(await mobileClient(staff, id));
});
