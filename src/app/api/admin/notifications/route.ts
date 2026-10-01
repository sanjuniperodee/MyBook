import { NextResponse } from "next/server";
import { z } from "zod";
import { api, apiStaff } from "@/lib/api";
import { container } from "@/server/container";

/** Отметить уведомления прочитанными: { id } — одно, без id — все. */
export const POST = api(async (req) => {
  const staff = await apiStaff(req);
  const { id } = z.object({ id: z.string().uuid().optional() }).parse(await req.json().catch(() => ({})));
  await container().workspace.inbox.markRead(staff.user.id, id);
  return NextResponse.json({ ok: true });
});
