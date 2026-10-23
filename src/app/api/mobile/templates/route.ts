import { NextResponse } from "next/server";
import { z } from "zod";
import { saveMyTemplateAction } from "@/app/admin/templates/actions";
import { apiStaff } from "@/server/api";
import { container } from "@/server/container";
import { mobile } from "@/server/mobile-api";

export const dynamic = "force-dynamic";

/** Шаблоны ответов сотрудника: свои (mine, с порядком) и общие компании (shared) — текст как есть, с подстановками. */
export const GET = mobile(async (req) => {
  const staff = await apiStaff(req, "chats.view");
  const all = await container().messaging.view.templates(staff.user.id);
  const pick = ({ id, title, text }: { id: string; title: string; text: string }) => ({ id, title, text });
  return NextResponse.json({ mine: all.filter((t) => t.own).map(pick), shared: all.filter((t) => !t.own).map(pick) });
});

/** Создать личный шаблон (без id) или изменить свой. */
export const POST = mobile(async (req) => {
  await apiStaff(req, "chats.view");
  const b = z.object({ id: z.string().optional(), title: z.string().max(200), text: z.string().max(5000) }).parse(await req.json());
  const r = await saveMyTemplateAction(b.id ?? "", b.title, b.text);
  return NextResponse.json(r, { status: r.error ? 400 : 200 });
});
