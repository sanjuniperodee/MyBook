import { NextResponse } from "next/server";
import { z } from "zod";
import { completeTaskAction } from "@/app/admin/actions";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";

export const dynamic = "force-dynamic";

const body = z.object({ result: z.string().max(500).optional(), nextTitle: z.string().max(300).optional(), nextDue: z.string().max(20).optional() });

/** «Что сделали?» — выполнить задачу с итогом (в ленту сделки/клиента) и сразу следующий шаг, как в CRM. */
export const POST = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req);
  const { id } = idParams(await params, "id");
  const r = await completeTaskAction(id, body.parse(await req.json()));
  return r.error ? NextResponse.json({ error: r.error }, { status: 400 }) : NextResponse.json({ ok: true });
});
