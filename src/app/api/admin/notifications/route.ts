import { NextResponse } from "next/server";
import { z } from "zod";
import { uuid } from "@/server/input";
import { api, apiStaff } from "@/server/api";
import { container } from "@/server/container";

/** Отметить уведомления прочитанными: { id } — одно, без id — все. */
export const POST = api(async (req) => {
  const staff = await apiStaff(req);
  const { id } = z.object({ id: uuid.optional() }).parse(await req.json().catch(() => ({})));
  await container().workspace.inbox.markRead(staff.user.id, id);
  return NextResponse.json({ ok: true });
});
