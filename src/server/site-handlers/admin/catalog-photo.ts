import { api, apiStaff, HttpError } from "@/server/api";
import { container } from "@/server/container";

/** Фото товара из WhatsApp (форма правки товара показывает все его фото); только адреса CDN WhatsApp — их проверяет шлюз. */
export const GET = api(async (req) => {
  await apiStaff(req, "catalog.manage");
  const url = new URL(req.url).searchParams.get("u") ?? "";
  if (!/^https:\/\/[a-z0-9.-]+\.(whatsapp\.net|fbcdn\.net)\//i.test(url)) throw new HttpError(404, "notFound");
  const image = await container().messaging.gowa.catalogImage(url).catch(() => null);
  if (!image) throw new HttpError(404, "notFound");
  return new Response(image.data as BlobPart, { headers: { "Content-Type": image.mime, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
});
