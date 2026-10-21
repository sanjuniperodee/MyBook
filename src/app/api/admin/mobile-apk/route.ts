import { NextResponse } from "next/server";
import { api, apiStaff, HttpError } from "@/server/api";
import { audit } from "@/server/access";
import { hasMobileApk, looksLikeApk, MOBILE_APK_MAX_BYTES, MOBILE_APK_NAME, readMobileApk, saveMobileApk } from "@/server/mobile-apk";

export const maxDuration = 120;

/** Скачать APK продажника — любому сотруднику (приложение ставят продавцы). */
export const GET = api(async (req) => {
  await apiStaff(req);
  if (!(await hasMobileApk())) throw new HttpError(404, "notFound");
  const data = await readMobileApk();
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Disposition": `attachment; filename="${MOBILE_APK_NAME}"`,
      "Content-Length": String(data.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

/** Загрузить новый APK (поле apk, multipart) — только с правом управлять настройками сайта. */
export const POST = api(async (req) => {
  const staff = await apiStaff(req, "settings.manage");
  const form = await req.formData();
  const file = form.get("apk");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Выберите APK-файл" }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".apk")) return NextResponse.json({ error: "Нужен файл с расширением .apk" }, { status: 400 });
  if (file.size > MOBILE_APK_MAX_BYTES) return NextResponse.json({ error: "Файл больше 150 МБ" }, { status: 400 });
  const data = new Uint8Array(await file.arrayBuffer());
  if (!looksLikeApk(data)) return NextResponse.json({ error: "Это не APK: файл повреждён или не тот" }, { status: 400 });
  await saveMobileApk(data);
  await audit(staff, "settings.update", "settings", "mobile.apk", { name: file.name, size: file.size });
  return NextResponse.json({ ok: true, size: file.size });
});
