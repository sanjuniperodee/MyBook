import { api, apiStaff, HttpError } from "@/server/api";
import { can } from "@/server/access";
import { container } from "@/server/container";

/** Обложка товара каталога WhatsApp — сотрудникам, которые пишут клиентам (выбор товара в чате) или ведут каталог. */
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req);
  if (!can(staff, "chats.view") && !can(staff, "catalog.manage")) throw new HttpError(403, "forbidden");
  const { id } = await params;
  if (!/^\d{1,40}$/.test(id)) throw new HttpError(404, "notFound");
  const image = await container().messaging.catalog.image(id);
  if (!image) throw new HttpError(404, "notFound");
  return new Response(image.data as BlobPart, {
    headers: { "Content-Type": image.mime, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
});
