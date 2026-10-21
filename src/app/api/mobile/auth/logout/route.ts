import { NextResponse } from "next/server";
import { api, apiUser } from "@/server/api";
import { sessionToken } from "@/server/auth";
import { container } from "@/server/container";

export const dynamic = "force-dynamic";

/** Выход: сессия закрывается на сервере, токен перестаёт действовать. */
export const POST = api(async (req) => {
  await apiUser(req);
  await container().identity.auth.logout((await sessionToken()) ?? undefined);
  return NextResponse.json({ ok: true });
});
