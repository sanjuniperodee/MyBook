import { NextResponse } from "next/server";
import { api, HttpError } from "@/server/api";
import { container } from "@/server/container";
import { authFailure, finishSession, limited, readTicket, secondFactorBody } from "@/server/mobile-auth";

export const dynamic = "force-dynamic";

/** Второй шаг входа: { ticket, code } — код из приложения-аутентификатора или резервный. */
export const POST = api(async (req) => {
  const { ticket, code } = secondFactorBody.parse(await req.json());
  const userId = readTicket(ticket);
  if (!userId) throw new HttpError(401, "unauthorized");
  const tooMany = await limited(`2fa:${userId}`);
  if (tooMany) return tooMany;
  try {
    return NextResponse.json(await finishSession(await container().identity.auth.completeSecondFactor(userId, code, "ru")));
  } catch (err) {
    return authFailure(err);
  }
});
