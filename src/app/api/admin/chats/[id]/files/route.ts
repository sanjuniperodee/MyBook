import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { api, apiStaff, HttpError } from "@/server/api";
import { canWork } from "@/server/access";
import { container } from "@/server/container";
import { idParams, uuid } from "@/server/input";
import { MessageActionError } from "@/modules/messaging";
import { sensitiveFor, sensitiveWhat } from "@/server/sensitive";

export const maxDuration = 120;

/** До стольких файлов за раз (фото и видео пачкой, как менеджер шлёт примеры книг). */
const MAX_FILES = 10;

/**
 * Файлы клиенту из чата (фото, видео, аудио, документы) — multipart: files (до 10), caption (подпись к первому файлу),
 * replyToId (ответ на сообщение). Отправляет тот, кто ведёт диалог; файлы уходят по одному, по порядку. В подписи чужой
 * номер, карта, IBAN или ссылка на перевод Kaspi — 400, не уходит ничего (как у сообщения без причины).
 */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "chats.view", "chats.send");
  const { id } = idParams(await params, "id");
  const conv = await container().messaging.queries.conversation(id);
  if (!conv) throw new HttpError(404, "notFound");
  if (!canWork(staff, conv.assigneeId)) throw new HttpError(403, "forbidden");
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return NextResponse.json({ error: "Выберите файл" }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `Не больше ${MAX_FILES} файлов за раз` }, { status: 400 });
  const caption = String(form.get("caption") ?? "").slice(0, 1000);
  // Подпись — тот же текст клиенту, что и сообщение: чужой номер, карта или реквизиты не уходят ни с одним файлом.
  const findings = await sensitiveFor(conv, caption);
  if (findings.length) throw new HttpError(400, "sensitiveCaption", sensitiveWhat(findings));
  const replyRaw = String(form.get("replyToId") ?? "");
  const replyToId = uuid.safeParse(replyRaw).success ? replyRaw : null;
  const results: { name: string; id?: string; status?: string; error?: string }[] = [];
  for (const [i, f] of files.entries()) {
    try {
      const msg = await container().messaging.sendUpload(conv.id, { data: new Uint8Array(await f.arrayBuffer()), name: f.name, mime: f.type }, i === 0 ? caption : "", staff.user.id, { replyToId: i === 0 ? replyToId : null });
      results.push({ name: f.name, id: msg.id, status: msg.status, ...("error" in msg && msg.error ? { error: msg.error } : {}) });
    } catch (err) {
      if (!MessageActionError.is(err)) throw err;
      results.push({ name: f.name, error: err.message });
    }
  }
  revalidatePath("/admin/chats");
  return NextResponse.json({ results });
});
