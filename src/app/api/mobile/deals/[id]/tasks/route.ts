import { NextResponse } from "next/server";
import { z } from "zod";
import { createTaskAction } from "@/app/admin/actions";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";

export const dynamic = "force-dynamic";

/** Задача по сделке: { title, dueAt?: "ГГГГ-ММ-ДД", dueTime?: "ЧЧ:ММ", kind? }. */
export const POST = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req);
  const { id } = idParams(await params, "id");
  const b = z.object({ title: z.string().min(2).max(300), dueAt: z.string().optional(), dueTime: z.string().optional(), kind: z.enum(["task", "call", "message", "meeting"]).optional() }).parse(await req.json());
  const form = new FormData();
  form.set("dealId", id);
  form.set("title", b.title);
  if (b.dueAt) form.set("dueAt", b.dueAt);
  if (b.dueTime) form.set("dueTime", b.dueTime);
  if (b.kind) form.set("kind", b.kind);
  const r = await createTaskAction({}, form);
  return NextResponse.json(r, { status: r.error ? 400 : 200 });
});
