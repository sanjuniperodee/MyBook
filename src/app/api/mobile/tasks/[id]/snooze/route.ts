import { NextResponse } from "next/server";
import { z } from "zod";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";
import { snoozeTaskAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

/** Отложить задачу одной кнопкой: { by: "hour" | "tomorrow" } — срок считает сервер. */
export const POST = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req);
  const { id } = idParams(await params, "id");
  const { by } = z.object({ by: z.enum(["hour", "tomorrow"]) }).parse(await req.json());
  const r = await snoozeTaskAction(id, by);
  return NextResponse.json(r, { status: r.error ? 400 : 200 });
});
