import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { api, apiStaff } from "@/lib/api";
import { db } from "@/lib/db";
import { crmNotifications } from "@/lib/db/schema";

/** Отметить уведомления прочитанными: { id } — одно, без id — все. */
export const POST = api(async (req) => {
  const staff = await apiStaff(req);
  const { id } = z.object({ id: z.string().uuid().optional() }).parse(await req.json().catch(() => ({})));
  const mine = and(eq(crmNotifications.userId, staff.user.id), isNull(crmNotifications.readAt));
  await db
    .update(crmNotifications)
    .set({ readAt: new Date() })
    .where(id ? and(mine, eq(crmNotifications.id, id)) : mine);
  return NextResponse.json({ ok: true });
});
