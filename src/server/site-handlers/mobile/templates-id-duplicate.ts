import { NextResponse } from "next/server";
import { duplicateTemplateAction } from "@/server/crm-actions/templates";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";

/** Копия шаблона (своего или общего) в личные. */
export const POST = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req, "chats.view");
  const { id } = idParams(await params, "id");
  const r = await duplicateTemplateAction(id);
  return NextResponse.json(r, { status: r.error ? 400 : 200 });
});
