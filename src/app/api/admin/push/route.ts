import { NextResponse } from "next/server";
import { z } from "zod";
import { api, apiStaff } from "@/lib/api";
import { container } from "@/server/container";
import { vapidKeys } from "@/lib/crm/push";

/** Публичный ключ VAPID для подписки браузера. */
export const GET = api(async (req) => {
  await apiStaff(req);
  const { publicKey } = await vapidKeys();
  return NextResponse.json({ publicKey });
});

const sub = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }) });

/** Подписать это устройство на push-уведомления сотрудника. */
export const POST = api(async (req) => {
  const staff = await apiStaff(req);
  const s = sub.parse(await req.json());
  await container().workspace.inbox.subscribe(staff.user.id, { endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, userAgent: (req.headers.get("user-agent") ?? "").slice(0, 200) });
  return NextResponse.json({ ok: true });
});

export const DELETE = api(async (req) => {
  const staff = await apiStaff(req);
  const { endpoint } = z.object({ endpoint: z.string().max(1000) }).parse(await req.json());
  await container().workspace.inbox.unsubscribe(staff.user.id, endpoint);
  return NextResponse.json({ ok: true });
});
