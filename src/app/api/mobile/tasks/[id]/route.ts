import { NextResponse } from "next/server";
import { z } from "zod";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";
import { deleteTaskAction, updateTaskAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

const patch = z.object({
  title: z.string().min(2).max(300).optional(),
  kind: z.enum(["task", "call", "message", "meeting"]).optional(),
  dueAt: z.string().nullable().optional(),
  remindBeforeMin: z.string().nullable().optional(),
  assigneeId: z.string().uuid().optional(),
  result: z.string().max(1000).optional(),
});

/** Изменить задачу: заголовок, тип, срок (пустая строка — без срока), напоминание, ответственный, результат. */
export const PATCH = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req);
  const { id } = idParams(await params, "id");
  const r = await updateTaskAction(id, patch.parse(await req.json()));
  return NextResponse.json(r, { status: r.error ? 400 : 200 });
});

export const DELETE = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req);
  const { id } = idParams(await params, "id");
  await deleteTaskAction(id);
  return NextResponse.json({ ok: true });
});
