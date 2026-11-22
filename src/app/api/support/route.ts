import { after, NextResponse } from "next/server";
import { checkOrigin, HttpError } from "@/server/api";
import { getStaff } from "@/server/access";
import { container } from "@/server/container";
import { rateLimit, trustedClientIp } from "@/server/rateLimit";
import { SupportError, type UploadedFile } from "@/modules/support";

export const maxDuration = 300;

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

/**
 * Новое обращение с формы /support (без входа): поля, голосовые, записанные в форме (voice), и любые файлы (files) —
 * скриншоты, видео, пересланные голосовые WhatsApp. Ответ — номер обращения; расшифровка и суть — после ответа.
 */
export async function POST(req: Request) {
  try {
    checkOrigin(req);
  } catch {
    return NextResponse.json({ error: "Запрос не с сайта MyBooks" }, { status: 403 });
  }
  const ip = await trustedClientIp();
  if (!(await rateLimit(`support:create:${ip}`, 12, 3_600_000))) return NextResponse.json({ error: "Слишком много обращений подряд — попробуйте через час или напишите в WhatsApp" }, { status: 429 });

  // Общий предел на сутки: форма без входа, каждое обращение тратит AI и будит сотрудников колокольчиком.
  if (!(await rateLimit("support:create:all", 300, 86_400_000))) return NextResponse.json({ error: "Форма временно перегружена — напишите нам в WhatsApp" }, { status: 429 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Не удалось прочитать форму — возможно, файлы слишком большие" }, { status: 400 });
  }
  // Ловушка для роботов: поле скрыто от людей.
  if (text(form, "website")) return NextResponse.json({ number: 0 });

  const uploads: UploadedFile[] = [];
  for (const [key, recorded] of [["voice", true], ["files", false]] as const) {
    for (const f of form.getAll(key)) {
      if (f instanceof File && f.size > 0) uploads.push({ name: f.name || (recorded ? "голосовое.webm" : "файл"), mime: f.type, data: Buffer.from(await f.arrayBuffer()), recorded });
    }
  }
  const staff = await getStaff().catch(() => null);
  try {
    const support = container().support;
    const ticket = await support.tickets.create(
      {
        kind: text(form, "kind"),
        urgency: text(form, "urgency"),
        description: text(form, "description"),
        place: text(form, "place"),
        expected: text(form, "expected"),
        reporterName: text(form, "reporterName") || staff?.user.name || "",
        notifyPhone: text(form, "notifyPhone"),
        clientPhone: text(form, "clientPhone"),
        device: text(form, "device"),
        userAgent: req.headers.get("user-agent") ?? "",
      },
      uploads,
      { userId: staff?.user.id ?? null, name: staff ? staff.user.name || staff.user.email : text(form, "reporterName") },
    );
    after(() => support.tickets.process(ticket.id).catch((err) => console.error("[support] process", err)));
    return NextResponse.json({ number: ticket.number, phone: ticket.notifyPhone });
  } catch (err) {
    if (SupportError.is(err)) return NextResponse.json({ error: err.message }, { status: 400 });
    if (HttpError.is(err)) return NextResponse.json({ error: "Не получилось отправить" }, { status: err.status });
    console.error("[support] create", err);
    return NextResponse.json({ error: "Не получилось сохранить обращение — попробуйте ещё раз" }, { status: 500 });
  }
}
