import { api, apiStaff, HttpError } from "@/server/api";
import { canSeeAssigned, ForbiddenError } from "@/server/access";
import { container } from "@/server/container";
import { idParams } from "@/server/input";
import { GowaError, MediaUnavailableError } from "@/modules/messaging";

/** Range браузера, который передаём шлюзу: один диапазон байтов, без списков и мусора. */
const RANGE = /^bytes=\d{0,15}-\d{0,15}$/;

/**
 * Вложение сообщения WhatsApp (голосовое, фото, файл) по id сообщения CRM — сотруднику, который видит диалог
 * или сделку, к которой диалог привязан (страница сделки показывает её переписку, даже если у чата другой ответственный).
 * Путь к файлу в шлюзе остаётся на сервере; вложение из истории шлюз скачивает при первом открытии.
 */
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "chats.view");
  const { id } = idParams(await params, "id");
  const media = container().messaging.media;
  const attachment = await media.find(id);
  if (!attachment) throw new HttpError(404, "notFound");
  const { assigneeId, dealId } = attachment.conversation;
  if (!canSeeAssigned(staff, assigneeId)) {
    const deal = dealId ? await container().sales.deals.findById(dealId) : null;
    if (!deal || !canSeeAssigned(staff, deal.assigneeId)) throw new ForbiddenError();
  }
  const range = req.headers.get("range");
  let file;
  try {
    file = await media.open(attachment, range && RANGE.test(range) && range !== "bytes=-" ? range : null);
  } catch (err) {
    if (GowaError.is(err) || MediaUnavailableError.is(err)) return new Response(err.message, { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    throw err;
  }
  if (!file) throw new HttpError(404, "notFound");
  return new Response(file.body, {
    status: file.range ? 206 : 200,
    headers: {
      "Content-Type": file.contentType ?? "application/octet-stream",
      ...(file.size ? { "Content-Length": file.size } : {}),
      ...(file.range ? { "Content-Range": file.range } : {}),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      // Файл от клиента: открываем как загрузку, а не страницу сайта (HTML/SVG внутри не исполнятся).
      "Content-Security-Policy": "sandbox",
    },
  });
});
