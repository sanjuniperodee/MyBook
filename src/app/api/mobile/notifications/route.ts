import { NextResponse } from "next/server";
import { z } from "zod";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";
import { staffNotifications } from "@/modules/workspace";
import { container } from "@/server/container";

export const dynamic = "force-dynamic";

/** Лента уведомлений сотрудника: ?limit=60. */
export const GET = mobile(async (req) => {
  const staff = await apiStaff(req);
  const limit = Number(new URL(req.url).searchParams.get("limit")) || 60;
  return NextResponse.json({ notifications: await staffNotifications(staff.user.id, limit) });
});

/** Отметить прочитанными: { id } — одно, без id — все. */
export const POST = mobile(async (req) => {
  const staff = await apiStaff(req);
  const { id } = z.object({ id: z.string().uuid().optional() }).parse(await req.json().catch(() => ({})));
  if (id) idParams({ id }, "id");
  await container().workspace.inbox.markRead(staff.user.id, id);
  return NextResponse.json({ ok: true });
});
