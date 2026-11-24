import { NextResponse } from "next/server";
import { orderItemsAction } from "@/app/admin/catalog/actions";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";

export const dynamic = "force-dynamic";

/** Состав корзины, которую клиент прислал из каталога WhatsApp («Показать состав»). */
export const GET = mobile(async (req, { params }: { params: Promise<{ mid: string }> }) => {
  await apiStaff(req, "chats.view");
  const { mid } = idParams(await params, "mid");
  const r = await orderItemsAction(mid);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ items: r.items, total: r.total, currency: r.currency });
});
