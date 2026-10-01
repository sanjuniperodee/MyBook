import { NextResponse } from "next/server";
import { z } from "zod";
import { api, checkOrigin, HttpError } from "@/lib/api";
import { getCurrentUser } from "@/server/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/crm/phone";
import { requestCallback, widgetConfig } from "@/lib/crm/site-chat";

const schema = z.object({
  name: z.string().trim().max(80).default(""),
  phone: z.string().trim().max(30),
  comment: z.string().trim().max(500).optional(),
  page: z.string().max(200).optional(),
});

/** «Перезвоните мне» из виджета на сайте: сделка + задача позвонить через 15 минут. */
export const POST = api(async (req) => {
  checkOrigin(req);
  if (!(await widgetConfig()).enabled) throw new HttpError(403, "widgetOff");
  const body = schema.parse(await req.json());
  if (normalizePhone(body.phone).length < 10) throw new HttpError(400, "widgetPhone");
  if (!rateLimit(`callback:${await clientIp()}`, 5, 3600_000)) throw new HttpError(429, "widgetRate");
  const user = await getCurrentUser();
  await requestCallback({ ...body, userId: user?.role === "user" ? user.id : null });
  return NextResponse.json({ ok: true });
});
