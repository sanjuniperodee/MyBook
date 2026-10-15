"use server";

import { cookies } from "next/headers";
import { lredirect } from "@/i18n/server";
import { getCurrentUser } from "@/server/auth";
import { isSecureCookie } from "@/config/env";
import { container } from "@/server/container";
import { clientIp, rateLimit } from "@/server/rateLimit";
import { GIFT_COOKIE } from "@/modules/ordering";
import { registrationOpen } from "@/config/site";
import { z } from "zod";
import { formText } from "@/server/input";

/** Запоминает код сертификата — он подставится при оформлении заказа — и ведёт к созданию книги. */
export async function activateGiftAction(form: FormData) {
  if (!await rateLimit(`redeem:${await clientIp()}`, 30, 600_000)) return lredirect("/redeem?error=limit");
  const code = formText.pipe(z.string().max(100)).safeParse(form.get("code") ?? undefined);
  if (!code.success) return lredirect("/redeem");
  const check = await container().ordering.promos.check(code.data);
  if (!check.ok) return lredirect(`/redeem?code=${encodeURIComponent(code.data)}`);
  (await cookies()).set(GIFT_COOKIE, check.promo.code, { httpOnly: true, sameSite: "lax", secure: isSecureCookie, maxAge: 60 * 60 * 24 * 365, path: "/" });
  const user = await getCurrentUser();
  return lredirect(user ? "/books/new" : registrationOpen() ? "/register" : "/login");
}
