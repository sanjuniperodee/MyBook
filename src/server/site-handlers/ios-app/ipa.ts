import { admin } from "@/i18n/admin";
import { iosBuild, readIosIpa, readIosToken } from "@/server/ios-app";

/** Файл iPhone-версии для установщика iOS — по подписанной ссылке из манифеста (час). */
export async function GET(req: Request) {
  if (!readIosToken(new URL(req.url).searchParams.get("t"), "install")) return new Response(admin.iosLinkExpired, { status: 403 });
  if (!(await iosBuild())) return new Response(admin.iosNoBuild, { status: 404 });
  const data = await readIosIpa();
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": "application/octet-stream", "Content-Length": String(data.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
