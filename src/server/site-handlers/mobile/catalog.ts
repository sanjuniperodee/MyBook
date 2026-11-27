import { chatProductsAction } from "@/server/crm-actions/catalog";
import { apiStaff } from "@/server/api";
import { mobile } from "@/server/mobile-api";
import { admin } from "@/i18n/admin";

/** Товары каталога WhatsApp для выбора в чате (как «Товар из каталога» в CRM); фото — /api/admin/catalog/<id>/image. */
export const GET = mobile(async (req) => {
  await apiStaff(req, "chats.view", "chats.send");
  let r: Awaited<ReturnType<typeof chatProductsAction>>;
  try {
    r = await chatProductsAction();
  } catch (err) {
    // Каталог обновляется из WhatsApp через шлюз: шлюз недоступен — понятный текст вместо «ошибки сервера».
    console.error("[mobile:catalog]", err);
    return Response.json({ error: admin.mobileCatalogDown }, { status: 503 });
  }
  if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
  return Response.json({ enabled: r.enabled, products: r.products });
});
