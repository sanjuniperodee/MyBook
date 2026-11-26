import { after, NextResponse } from "next/server";
import { api, apiStaff, HttpError } from "@/server/api";
import { can, canSeeAssigned } from "@/server/access";
import { uuid } from "@/server/input";
import { z } from "zod";
import { container } from "@/server/container";
import { SupportError, type UploadedFile } from "@/modules/support";

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

/**
 * Новое обращение от сотрудника CRM (руководитель, менеджер): поля, голосовые, записанные в форме (voice), и любые
 * файлы (files) — скриншоты, видео, пересланные голосовые клиента. Клиентам форма недоступна. Ответ — номер обращения;
 * расшифровка и суть — после ответа.
 */
export const POST = api(async (req: Request) => {
  const staff = await apiStaff(req);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Не удалось прочитать форму — возможно, файлы слишком большие" }, { status: 400 });
  }
  const uploads: UploadedFile[] = [];
  for (const [key, recorded] of [["voice", true], ["files", false]] as const) {
    for (const f of form.getAll(key)) {
      if (f instanceof File && f.size > 0) uploads.push({ name: f.name || (recorded ? "голосовое.webm" : "файл"), mime: f.type, data: Buffer.from(await f.arrayBuffer()), recorded });
    }
  }
  const name = staff.user.name || staff.user.email;
  // Выбранная переписка клиента: только чат, который сотруднику виден.
  const conversationId = text(form, "conversationId");
  let messageIds: string[] = [];
  if (conversationId) {
    if (!can(staff, "chats.view")) throw new HttpError(403, "forbidden");
    const conv = await container().messaging.queries.conversation(uuid.parse(conversationId));
    if (!conv || !canSeeAssigned(staff, conv.assigneeId)) return NextResponse.json({ error: "Этот чат вам недоступен" }, { status: 403 });
    messageIds = z.array(uuid).max(200).parse(JSON.parse(text(form, "messageIds") || "[]"));
  }
  try {
    const support = container().support;
    const ticket = await support.tickets.create(
      {
        kind: text(form, "kind"),
        urgency: text(form, "urgency"),
        description: text(form, "description"),
        place: text(form, "place"),
        expected: text(form, "expected"),
        reporterName: name,
        notifyPhone: text(form, "notifyPhone") || staff.user.phone || "",
        clientPhone: text(form, "clientPhone"),
        device: text(form, "device"),
        userAgent: req.headers.get("user-agent") ?? "",
      },
      uploads,
      { userId: staff.user.id, name },
      { chatMessages: messageIds.length },
    );
    if (conversationId && messageIds.length) await support.tickets.linkChat(ticket.id, conversationId, messageIds, { userId: staff.user.id, name });
    after(() => support.tickets.process(ticket.id).catch((err) => console.error("[support] process", err)));
    return NextResponse.json({ number: ticket.number, phone: ticket.notifyPhone });
  } catch (err) {
    if (SupportError.is(err)) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
});
