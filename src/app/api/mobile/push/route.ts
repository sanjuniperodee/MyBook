import { NextResponse } from "next/server";
import { z } from "zod";
import { api, apiStaff } from "@/server/api";
import { mobile } from "@/server/mobile-api";
import { fcmClientOptions, fcmConfig, mobileDevices } from "@/modules/workspace";

export const dynamic = "force-dynamic";

const iosToken = z.string().regex(/^[0-9a-fA-F]{32,200}$/);
/** Токен FCM: буквы, цифры, «:», «-», «_» (обычно ~160 знаков). */
const fcmToken = z.string().regex(/^[A-Za-z0-9:_-]{32,4096}$/);
const device = z.discriminatedUnion("platform", [
  z.object({ platform: z.literal("ios"), token: iosToken, environment: z.enum(["production", "sandbox"]).default("production") }),
  z.object({ platform: z.literal("android"), token: fcmToken, environment: z.enum(["production", "sandbox"]).default("production") }),
]);

/**
 * Настройки push для телефона: Android получает данные проекта Firebase (без них FCM-токен не выдаётся) — так ключ
 * можно добавить на сервер без пересборки приложения. iPhone ничего не нужно: токен APNs выдаёт система.
 */
export const GET = mobile(async (req) => {
  await apiStaff(req);
  return NextResponse.json({ ios: mobileDevices.pushReady("ios"), android: fcmClientOptions(fcmConfig()) });
});

/** Зарегистрировать телефон для push: токен APNs или FCM; повторная регистрация обновляет владельца и окружение. */
export const POST = mobile(async (req) => {
  const staff = await apiStaff(req);
  const raw = (await req.json()) as Record<string, unknown>;
  const d = device.parse({ platform: "ios", ...raw });
  await mobileDevices.register(staff.user.id, d);
  // Ключа на сервере нет — push на телефоны пока не уходят (уведомления при открытом приложении работают).
  return NextResponse.json({ ok: true, serverReady: mobileDevices.pushReady(d.platform) });
});

/** Забыть телефон (выход из аккаунта). */
export const DELETE = api(async (req) => {
  const staff = await apiStaff(req);
  await mobileDevices.forget(staff.user.id, z.object({ token: z.union([iosToken, fcmToken]) }).parse(await req.json()).token);
  return NextResponse.json({ ok: true });
});
