import "server-only";
import { cookies } from "next/headers";
import { INVITE_COOKIE } from "@/modules/referrals";
import { consoleLogger } from "@/shared/application";
import { container } from "@/server/container";

const log = consoleLogger("invite");

/** Посетитель пришёл по ссылке-приглашению: от кого подарок и какой. Сбой не должен ронять страницу. */
export async function invitedBy() {
  const code = (await cookies()).get(INVITE_COOKIE)?.value;
  if (!code) return null;
  try {
    return await container().referrals.service.welcome(code);
  } catch (err) {
    log.error("invite welcome", err);
    return null;
  }
}

/** Код-приглашение из cookie — для оформления заказа. */
export async function inviteCodeFromCookie() {
  return (await cookies()).get(INVITE_COOKIE)?.value ?? null;
}
