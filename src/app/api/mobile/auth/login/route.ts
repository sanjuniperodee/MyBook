import { NextResponse } from "next/server";
import { api } from "@/server/api";
import { container } from "@/server/container";
import { authFailure, finishSession, issueTicket, limited, loginBody } from "@/server/mobile-auth";

export const dynamic = "force-dynamic";

/** Вход сотрудника: { login, password } → токен сессии или { twoFactor: true, ticket } — тогда код на /api/mobile/auth/2fa. */
export const POST = api(async (req) => {
  const { login, password } = loginBody.parse(await req.json());
  const tooMany = await limited(login);
  if (tooMany) return tooMany;
  try {
    const result = await container().identity.auth.login({ login, password, locale: "ru" });
    if (result.kind === "second_factor") return NextResponse.json({ twoFactor: true, ticket: issueTicket(result.userId) });
    return NextResponse.json(await finishSession(result));
  } catch (err) {
    return authFailure(err);
  }
});
