import { after } from "next/server";
import { env } from "@/config/env";
import { resignAfterEnroll } from "@/server/ios-sign";
import { parseDeviceAttributes, readIosToken, saveIosDevice } from "@/server/ios-app";

/**
 * Ответ телефона после установки профиля регистрации: подписанный plist с UDID (без cookie — сотрудника определяет ссылка
 * из профиля). iOS ждёт перенаправление 301 — открывает страницу в Safari.
 */
export async function POST(req: Request) {
  const back = `${env.appUrl.replace(/\/+$/, "")}/admin/app`;
  const userId = readIosToken(new URL(req.url).searchParams.get("t"), "enroll");
  if (!userId) return Response.redirect(`${back}?ios=expired`, 301);
  const body = Buffer.from(await req.arrayBuffer());
  const device = body.length < 64 * 1024 ? parseDeviceAttributes(body) : null;
  if (!device) return Response.redirect(`${back}?ios=failed`, 301);
  await saveIosDevice(userId, device);
  // Сразу после ответа: телефон — в Apple, профиль — заново, приложение — переподписать (секунды), сотруднику — уведомление.
  after(resignAfterEnroll);
  return Response.redirect(`${back}?ios=registered`, 301);
}
