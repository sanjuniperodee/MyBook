import { api, apiStaff, HttpError } from "@/server/api";
import { container } from "@/server/container";
import { idParams } from "@/server/input";
import { serveStorageFile } from "@/server/range-file";
import { canOpenTicket } from "@/app/admin/support/access";
import { fileRoute } from "@/server/file-route";

/** Вложение обращения для сотрудника CRM: с Range (видео и голосовые в Safari), ?download=1 — скачать файлом. */
export const GET = fileRoute("support-file", api(async (req, { params }: { params: Promise<{ id: string; att: string }> }) => {
  const staff = await apiStaff(req);
  const p = await params;
  const { id } = idParams(p, "id");
  if (!/^[a-z0-9-]{1,40}$/.test(p.att)) throw new HttpError(404, "notFound");
  const ticket = await container().support.tickets.byId(id);
  if (!ticket || !canOpenTicket(staff, ticket)) throw new HttpError(404, "notFound");
  const attachment = await container().support.attachment(id, p.att);
  if (!attachment) throw new HttpError(404, "notFound");
  const download = new URL(req.url).searchParams.has("download");
  const name = encodeURIComponent(attachment.name);
  // Потоком из хранилища с Range — без скачивания файла из бакета на диск сайта.
  const mime = attachment.mime || "application/octet-stream";
  const res = await serveStorageFile(attachment.key, mime, req, {
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
    "X-Content-Type-Options": "nosniff",
    // Загруженный файл — чужой: HTML и SVG не исполняем как страницу сайта.
    "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; media-src 'self'",
  }, (r) => container().support.openAttachment(attachment, r));
  if (!res) throw new HttpError(404, "notFound");
  return res;
}));
