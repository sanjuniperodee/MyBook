import "server-only";
import { cookies } from "next/headers";
import { INVITE_COOKIE } from "@/shared/domain/orders";
import { consoleLogger } from "@/shared/application";
import { v1WebRead } from "./api";

const log = consoleLogger("invite");

/** Посетитель пришёл по ссылке-приглашению: от кого подарок и какой. Сбой не должен ронять страницу. */
export async function invitedBy() {
  const code = (await cookies()).get(INVITE_COOKIE)?.value;
  if (!code) return null;
  try {
    const { welcome } = await v1WebRead({
      name: "public.inviteWelcome",
      section: "public",
      sessionCookie: null,
      viaApi: (api) => api.webInviteWelcome({ code }),
    });
    return welcome;
  } catch (err) {
    log.error("invite welcome", err);
    return null;
  }
}
