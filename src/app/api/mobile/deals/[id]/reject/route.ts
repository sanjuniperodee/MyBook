import { NextResponse } from "next/server";
import { z } from "zod";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";
import { rejectDealAction } from "@/app/admin/deals/actions";

export const dynamic = "force-dynamic";

/** Отклонить заявку ({ spam, reason }): руководитель — сразу, менеджер — предложением руководителю. */
export const POST = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req, "deals.edit");
  const { id } = idParams(await params, "id");
  const b = z.object({ spam: z.boolean().default(false), reason: z.string().max(200).default("") }).parse(await req.json());
  return NextResponse.json(await rejectDealAction(id, b.spam, b.reason));
});
