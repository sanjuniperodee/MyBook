import { NextResponse } from "next/server";
import { chatProductsAction } from "@/app/admin/catalog/actions";
import { apiStaff } from "@/server/api";
import { mobile } from "@/server/mobile-api";

export const dynamic = "force-dynamic";

/** Товары каталога WhatsApp для выбора в чате (как «Товар из каталога» в CRM); фото — /api/admin/catalog/<id>/image. */
export const GET = mobile(async (req) => {
  await apiStaff(req, "chats.view", "chats.send");
  let r: Awaited<ReturnType<typeof chatProductsAction>>;
  try {
    r = await chatProductsAction();
  } catch (err) {
    // Каталог обновляется из WhatsApp через шлюз: шлюз недоступен — понятный текст вместо «ошибки сервера».
    console.error("[mobile:catalog]", err);
    return NextResponse.json({ error: "Каталог WhatsApp сейчас недоступен — шлюз не отвечает. Попробуйте позже." }, { status: 503 });
  }
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ enabled: r.enabled, products: r.products });
});
