import { admin } from "@/i18n/admin";
import { env } from "@/config/env";
import { installManifest, iosBuild, readIosToken } from "@/server/ios-app";

/** Манифест установки iPhone-версии (itms-services): установщик iOS ходит без cookie, доступ — по подписанной ссылке. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t");
  if (!readIosToken(token, "install")) return new Response(admin.iosLinkExpired, { status: 403 });
  const build = await iosBuild();
  if (!build) return new Response(admin.iosNoBuild, { status: 404 });
  const ipa = `${env.appUrl.replace(/\/+$/, "")}/api/ios-app/ipa?t=${encodeURIComponent(token!)}`;
  return new Response(installManifest(ipa, build), { headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "private, no-store" } });
}
