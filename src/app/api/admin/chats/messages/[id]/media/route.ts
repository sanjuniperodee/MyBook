import { api, apiStaff, HttpError } from "@/server/api";
import { assertVisible } from "@/server/access";
import { container } from "@/server/container";
import { idParams } from "@/server/input";
import { GowaError } from "@/modules/messaging";

/**
 * Вложение сообщения WhatsApp (голосовое, фото, файл) по id сообщения CRM — сотруднику, который видит диалог.
 * Путь к файлу в шлюзе остаётся на сервере; вложение из истории шлюз скачивает при первом открытии.
 */
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "chats.view");
  const { id } = idParams(await params, "id");
  const media = container().messaging.media;
  const attachment = await media.find(id);
  if (!attachment) throw new HttpError(404, "notFound");
  assertVisible(staff, attachment.conversation.assigneeId);
  let file;
  try {
    file = await media.open(attachment);
  } catch (err) {
    if (GowaError.is(err)) return new Response(err.message, { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    throw err;
  }
  if (!file) throw new HttpError(404, "notFound");
  return new Response(file.body, {
    headers: {
      "Content-Type": file.contentType ?? "application/octet-stream",
      ...(file.size ? { "Content-Length": file.size } : {}),
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      // Файл от клиента: открываем как загрузку, а не страницу сайта (HTML/SVG внутри не исполнятся).
      "Content-Security-Policy": "sandbox",
    },
  });
});
