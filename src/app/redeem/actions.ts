"use server";

import { cookies } from "next/headers";
import { lredirect } from "@/i18n/server";
import { getCurrentUser } from "@/server/auth";
import { isSecureCookie } from "@/config/env";
import { localRedeemCheck } from "@/server/v1-local-bridge-public";
import { v1WebAction } from "@/server/v1-web-client";
import { trustedClientIp, rateLimit } from "@/server/rateLimit";
import { GIFT_COOKIE } from "@/shared/domain/orders";
import { registrationOpen } from "@/config/site";
import { z } from "zod";
import { formText } from "@/server/input";

/** Запоминает код сертификата — он подставится при оформлении заказа — и ведёт к созданию книги. */
export async function activateGiftAction(form: FormData) {
  const code = formText.pipe(z.string().max(100)).safeParse(form.get("code") ?? undefined);
  if (!code.success) return lredirect("/redeem");
  // Лимит перебора кодов — на сервере с БД; сайт без БД проверяет код тем же запросом, что и страница активации.
  const found = await v1WebAction({
    section: "public",
    viaApi: (api) => api.webRedeemCheck({ code: code.data }),
    local: async () => ((await rateLimit(`redeem:${await trustedClientIp()}`, 30, 600_000)) ? localRedeemCheck(code.data) : null),
  });
  if (!found) return lredirect("/redeem?error=limit");
  const { check } = found;
  if (!check.ok) return lredirect(`/redeem?code=${encodeURIComponent(code.data)}`);
  (await cookies()).set(GIFT_COOKIE, check.code, { httpOnly: true, sameSite: "lax", secure: isSecureCookie, maxAge: 60 * 60 * 24 * 365, path: "/" });
  const user = await getCurrentUser();
  return lredirect(user ? "/books/new" : registrationOpen() ? "/register" : "/login");
}
