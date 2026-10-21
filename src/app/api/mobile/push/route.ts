import { NextResponse } from "next/server";
import { z } from "zod";
import { api, apiStaff } from "@/server/api";
import { mobile } from "@/server/mobile-api";
import { mobileDevices } from "@/modules/workspace";

export const dynamic = "force-dynamic";

const token = z.string().regex(/^[0-9a-fA-F]{32,200}$/);
const device = z.object({ token, platform: z.enum(["ios"]).default("ios"), environment: z.enum(["production", "sandbox"]).default("production") });

/** Зарегистрировать телефон для push: токен из APNs; повторная регистрация обновляет владельца и окружение. */
export const POST = mobile(async (req) => {
  const staff = await apiStaff(req);
  await mobileDevices.register(staff.user.id, device.parse(await req.json()));
  // Ключ APNs на сервере не задан — push на телефоны пока не уходят (уведомления при открытом приложении работают).
  return NextResponse.json({ ok: true, serverReady: mobileDevices.pushReady() });
});

/** Забыть телефон (выход из аккаунта). */
export const DELETE = api(async (req) => {
  const staff = await apiStaff(req);
  await mobileDevices.forget(staff.user.id, z.object({ token }).parse(await req.json()).token);
  return NextResponse.json({ ok: true });
});
