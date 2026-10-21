import { NextResponse } from "next/server";
import { z } from "zod";
import { apiStaff } from "@/server/api";
import { mobile } from "@/server/mobile-api";
import { createTaskAction } from "@/app/admin/actions";
import { mobileTasks } from "@/app/api/mobile/work";

export const dynamic = "force-dynamic";

/** Задачи: ?done=1 — выполненные; who=mine|all|<id> (всё — только роли «все записи»); kind; q. */
export const GET = mobile(async (req) => {
  const staff = await apiStaff(req);
  const u = new URL(req.url).searchParams;
  return NextResponse.json({ tasks: await mobileTasks(staff, { done: u.get("done") === "1", who: u.get("who") ?? undefined, kind: u.get("kind") ?? undefined, q: u.get("q")?.slice(0, 100) }) });
});

const body = z.object({
  title: z.string().min(2).max(300),
  dueAt: z.string().optional(),
  dueTime: z.string().optional(),
  kind: z.enum(["task", "call", "message", "meeting"]).optional(),
  remindBeforeMin: z.union([z.number().int().min(0).max(10080), z.literal("none")]).optional(),
  dealId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
});

/** Новая задача — по сделке, клиенту, заказу или сама по себе; срок «ГГГГ-ММ-ДД» и необязательное время «ЧЧ:ММ». */
export const POST = mobile(async (req) => {
  await apiStaff(req);
  const b = body.parse(await req.json());
  const form = new FormData();
  for (const [k, v] of Object.entries(b)) if (v !== undefined) form.set(k, String(v));
  const r = await createTaskAction({}, form);
  return NextResponse.json(r, { status: r.error ? 400 : 200 });
});
