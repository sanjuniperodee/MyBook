import { apiStaff, HttpError } from "@/server/api";
import { canSeeAssigned, ForbiddenError } from "@/server/access";
import { convertAudio } from "@/server/audio-convert";
import { container } from "@/server/container";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Голосовое или аудио сообщения в AAC (m4a): голосовые WhatsApp приходят в Ogg Opus, а iPhone его не играет. Права — как
 * у вложения в веб-версии (диалог виден сотруднику или сделка диалога). Без ffmpeg на сервере отдаётся исходный файл.
 */
export const GET = mobile(async (req, { params }: { params: Promise<{ mid: string }> }) => {
  const staff = await apiStaff(req, "chats.view");
  const { mid } = idParams(await params, "mid");
  const media = container().messaging.media;
  const attachment = await media.find(mid);
  if (!attachment) throw new HttpError(404, "notFound");
  const { assigneeId, dealId } = attachment.conversation;
  if (!canSeeAssigned(staff, assigneeId)) {
    const deal = dealId ? await container().sales.deals.findById(dealId) : null;
    if (!deal || !canSeeAssigned(staff, deal.assigneeId)) throw new ForbiddenError();
  }
  const file = await media.bytes(mid, 25_000_000);
  if (!file) throw new HttpError(404, "notFound");
  const converted = await convertAudio(file.data, "m4a");
  const out = converted ?? file;
  return new Response(out.data as BodyInit, { headers: { "Content-Type": converted?.mime ?? (file.mime || "application/octet-stream"), "Content-Length": String(out.data.length), "Cache-Control": "private, max-age=86400", "Content-Security-Policy": "sandbox", "X-Content-Type-Options": "nosniff" } });
});
