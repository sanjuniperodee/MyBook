import { NextResponse } from "next/server";
import { deleteMyTemplateAction } from "@/server/crm-actions/templates";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";

/** Удалить свой шаблон. */
export const DELETE = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req, "chats.view");
  const { id } = idParams(await params, "id");
  const r = await deleteMyTemplateAction(id);
  return NextResponse.json(r, { status: r.error ? 400 : 200 });
});
