import { NextResponse } from "next/server";
import { z } from "zod";
import { sendCatalogLinkAction, sendProductAction } from "@/server/crm-actions/catalog";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";

/** Клиенту в чат: карточка товара ({ productId }) или ссылка на весь каталог (без productId). */
export const POST = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req, "chats.view", "chats.send");
  const { id } = idParams(await params, "id");
  const { productId } = z.object({ productId: z.string().regex(/^\d{1,40}$/).nullish() }).parse(await req.json());
  const r = productId ? await sendProductAction(id, productId) : await sendCatalogLinkAction(id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
});
