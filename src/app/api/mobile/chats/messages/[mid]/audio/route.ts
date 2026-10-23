import { apiStaff, HttpError } from "@/server/api";
import { canSeeAssigned, ForbiddenError } from "@/server/access";
import { chatAudioFile } from "@/server/chat-audio";
import { container } from "@/server/container";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";
import { serveFile } from "@/server/range-file";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Голосовое или аудио сообщения для телефона: голосовые WhatsApp приходят в Ogg Opus, а iPhone его не играет, поэтому
 * один раз переводим в AAC (m4a) и кладём на диск. Дальше файл отдаётся потоком с Range (перемотка, докачка) и ETag —
 * в память он не читается и не перекодируется заново. Права — как у вложения в веб-версии (диалог виден сотруднику или
 * сделка диалога).
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
  const file = await chatAudioFile(mid);
  if (!file) throw new HttpError(404, "notFound");
  return serveFile(file.path, file.mime, req, { "Cache-Control": "private, max-age=86400", "Content-Security-Policy": "sandbox", "X-Content-Type-Options": "nosniff" });
});
