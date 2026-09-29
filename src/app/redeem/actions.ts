"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isSecureCookie } from "@/lib/env";
import { findValidPromo } from "@/lib/promo";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { GIFT_COOKIE } from "@/lib/gifts";

/** Запоминает код сертификата — он подставится при оформлении заказа — и ведёт к созданию книги. */
export async function activateGiftAction(form: FormData) {
  if (!rateLimit(`redeem:${await clientIp()}`, 30, 600_000)) redirect("/redeem?error=limit");
  const check = await findValidPromo(String(form.get("code") ?? ""));
  if (!check.ok) redirect(`/redeem?code=${encodeURIComponent(String(form.get("code") ?? ""))}`);
  (await cookies()).set(GIFT_COOKIE, check.promo.code, { httpOnly: true, sameSite: "lax", secure: isSecureCookie, maxAge: 60 * 60 * 24 * 365, path: "/" });
  const user = await getCurrentUser();
  redirect(user ? "/books/new" : "/register");
}
