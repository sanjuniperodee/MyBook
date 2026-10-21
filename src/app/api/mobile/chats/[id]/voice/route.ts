import { NextResponse } from "next/server";
import { admin } from "@/i18n/admin";
import { apiStaff, HttpError } from "@/server/api";
import { canWork } from "@/server/access";
import { convertAudio } from "@/server/audio-convert";
import { container } from "@/server/container";
import { idParams, uuid } from "@/server/input";
import { mobile } from "@/server/mobile-api";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Голосовое сообщение клиенту — multipart: voice (запись с телефона, обычно m4a), replyToId. Сервер перекодирует запись
 * в Ogg Opus — формат голосовых WhatsApp (без ffmpeg уходит как есть, аудиофайлом). Отправляет тот, кто ведёт диалог.
 */
export const POST = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "chats.view", "chats.send");
  const { id } = idParams(await params, "id");
  const conv = await container().messaging.queries.conversation(id);
  if (!conv) throw new HttpError(404, "notFound");
  if (!canWork(staff, conv.assigneeId)) throw new HttpError(403, "forbidden");
  const form = await req.formData();
  const file = form.get("voice");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: admin.mobileEmptyRecording }, { status: 400 });
  const replyRaw = String(form.get("replyToId") ?? "");
  const replyToId = uuid.safeParse(replyRaw).success ? replyRaw : null;
  const original = new Uint8Array(await file.arrayBuffer());
  const converted = await convertAudio(original, "ogg");
  const upload = converted ? { data: converted.data, name: "voice.ogg", mime: converted.mime } : { data: original, name: file.name || "voice.m4a", mime: file.type || "audio/mp4" };
  const msg = await container().messaging.sendUpload(conv.id, upload, "", staff.user.id, { replyToId });
  return NextResponse.json({ id: msg.id, status: msg.status, error: "error" in msg && msg.error ? msg.error : null, converted: !!converted });
});
