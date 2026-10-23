import { NextResponse } from "next/server";
import { z } from "zod";
import { reorderMyTemplatesAction } from "@/app/admin/templates/actions";
import { apiStaff } from "@/server/api";
import { mobile } from "@/server/mobile-api";

export const dynamic = "force-dynamic";

/** Порядок личных шаблонов: id сверху вниз. */
export const POST = mobile(async (req) => {
  await apiStaff(req, "chats.view");
  const { ids } = z.object({ ids: z.array(z.string()).max(100) }).parse(await req.json());
  return NextResponse.json(await reorderMyTemplatesAction(ids));
});
