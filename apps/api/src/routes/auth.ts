/** Вход по API: та же проверка пароля, 2FA сотрудника и лимиты попыток, что у сайта; сессия — токеном в ответе. */
import type { z } from "zod";
import type { Session as SessionDto, User as UserDto } from "@mybook/contracts";
import { IdentityError } from "@/modules/identity";
import { container } from "@/server/container";
import { isStaff, sessionToken } from "@/server/auth";
import { issueTicket, readTicket } from "@/server/mobile-auth";
import { rateLimit, trustedClientIp } from "@/server/rateLimit";
import { actionError } from "@/server/errors";
import { getLocale, getMessages } from "@/i18n/server";
import type { User as UserRow } from "@/shared/infrastructure/db/schema";
import type { Handlers } from "../app";

/** Что клиенту API нужно знать о пользователе — общее у агрегата User (вход) и строки сессии (me). */
interface UserView {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  locale: string;
  isStaff: boolean;
}

const toUserDto = (u: UserView): z.output<typeof UserDto> => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, locale: u.locale === "kk" ? "kk" : "ru", isStaff: u.isStaff });
const rowView = (u: UserRow): UserView => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, locale: u.locale, isStaff: isStaff(u) });

const toSessionDto = (s: { token: string; expiresAt: Date; user: UserView }): z.output<typeof SessionDto> => ({ token: s.token, expiresAt: s.expiresAt.toISOString(), user: toUserDto(s.user) });

/** Ошибка входа — 401 с текстом сайта (словарь auth на языке пользователя); прочее — настоящая ошибка. */
async function loginFailure(err: unknown): Promise<Response> {
  const text = await actionError(err, IdentityError);
  if (text === null) throw err;
  return Response.json({ error: text, code: IdentityError.is(err) ? err.code : undefined }, { status: 401 });
}

async function tooMany(keys: [string, number][]): Promise<Response | null> {
  for (const [key, max] of keys) {
    if (!(await rateLimit(key, max, 900_000))) return Response.json({ error: (await getMessages()).auth.errors.tooManyLogin, code: "tooManyLogins" }, { status: 429 });
  }
  return null;
}

export const authHandlers: Pick<Handlers, "authLogin" | "authSecondFactor" | "authLogout" | "me"> = {
  async authLogin({ input }) {
    const { login, password } = input.body;
    const limited = await tooMany([[`login:${await trustedClientIp()}`, 30], [`login:${login.toLowerCase()}`, 10]]);
    if (limited) return limited;
    try {
      const result = await container().identity.auth.login({ login, password, locale: await getLocale() });
      if (result.kind === "second_factor") return { session: null, secondFactorTicket: issueTicket(result.userId) };
      return { session: toSessionDto(result), secondFactorTicket: null };
    } catch (err) {
      return loginFailure(err);
    }
  },

  async authSecondFactor({ input }) {
    const userId = readTicket(input.body.ticket);
    if (!userId) return Response.json({ error: (await getMessages()).auth.errors.twoFactorExpired, code: "twoFactorExpired" }, { status: 401 });
    const limited = await tooMany([[`2fa:${userId}`, 8], [`2fa-ip:${await trustedClientIp()}`, 30]]);
    if (limited) return limited;
    try {
      return toSessionDto(await container().identity.auth.completeSecondFactor(userId, input.body.code, await getLocale()));
    } catch (err) {
      return loginFailure(err);
    }
  },

  async authLogout() {
    await container().identity.auth.logout((await sessionToken()) ?? undefined);
    return { ok: true };
  },

  async me({ user }) {
    return toUserDto(rowView(user!));
  },
};
