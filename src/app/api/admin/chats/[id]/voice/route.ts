import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { api, apiStaff, HttpError } from "@/server/api";
import { canWork } from "@/server/access";
import { convertAudio } from "@/server/audio-convert";
import { container } from "@/server/container";
import { idParams, uuid } from "@/server/input";
import { MessageActionError } from "@/modules/messaging";

export const maxDuration = 120;

/**
 * Голосовое сообщение клиенту из CRM — multipart: voice (запись браузера: webm/opus в Chrome и Firefox, mp4 в Safari),
 * replyToId. Сервер перекодирует запись в Ogg Opus — формат голосовых WhatsApp (без ffmpeg уходит как есть, аудиофайлом).
 * Отправляет тот, кто ведёт диалог.
 */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "chats.view", "chats.send");
  const { id } = idParams(await params, "id");
  const conv = await container().messaging.queries.conversation(id);
  if (!conv) throw new HttpError(404, "notFound");
  if (!canWork(staff, conv.assigneeId)) throw new HttpError(403, "forbidden");
  const form = await req.formData();
  const file = form.get("voice");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Запись пустая" }, { status: 400 });
  const replyRaw = String(form.get("replyToId") ?? "");
  const replyToId = uuid.safeParse(replyRaw).success ? replyRaw : null;
  const original = new Uint8Array(await file.arrayBuffer());
  const converted = await convertAudio(original, "ogg");
  const ext = /mp4|aac/.test(file.type) ? "m4a" : /ogg/.test(file.type) ? "ogg" : "webm";
  const upload = converted ? { data: converted.data, name: "voice.ogg", mime: converted.mime } : { data: original, name: `voice.${ext}`, mime: file.type || "audio/webm" };
  try {
    const msg = await container().messaging.sendUpload(conv.id, upload, "", staff.user.id, { replyToId });
    revalidatePath("/admin/chats");
    return NextResponse.json({ id: msg.id, status: msg.status, error: "error" in msg && msg.error ? msg.error : null, converted: !!converted });
  } catch (err) {
    if (!MessageActionError.is(err)) throw err;
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
});
