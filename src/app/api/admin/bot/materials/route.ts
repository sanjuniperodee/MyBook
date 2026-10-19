import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { api, apiStaff } from "@/server/api";
import { audit } from "@/server/access";
import { container } from "@/server/container";
import { MessageActionError } from "@/modules/messaging";

export const maxDuration = 120;

/**
 * Файл в подборку материалов AI-продажника (Настройки → Бот → Продажи → «Материалы»): multipart file, caption, lang
 * (any | ru | kk), about. Через API, а не server action: видео и примеры книг весят до 30 МБ.
 */
export const POST = api(async (req: Request) => {
  const staff = await apiStaff(req, "settings.manage");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Выберите файл" }, { status: 400 });
  const lang = String(form.get("lang") ?? "any");
  try {
    const m = await container().messaging.addMaterial(
      { data: new Uint8Array(await file.arrayBuffer()), name: file.name, mime: file.type },
      { caption: String(form.get("caption") ?? ""), about: String(form.get("about") ?? ""), lang: lang === "ru" || lang === "kk" ? lang : "any" },
      staff.user.id,
    );
    await audit(staff, "settings.update", "settings", "bot.materials", { added: m.name, kind: m.kind });
    revalidatePath("/admin/settings");
    return NextResponse.json({ material: m });
  } catch (err) {
    if (!MessageActionError.is(err)) throw err;
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
});
