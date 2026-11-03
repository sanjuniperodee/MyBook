import { NextResponse } from "next/server";
import { z } from "zod";
import { api, apiBook, checkOrigin, HttpError } from "@/server/api";
import { rateLimit } from "@/server/rateLimit";
import { idParams } from "@/server/input";
import { getMediaPack } from "@/config/site";
import { ensureCatalog } from "@/server/catalog";
import { createMediaPurchase } from "@/server/answerFiles";
import { kaspiPaymentProps } from "@/app/api/payments/kaspi/view";

const body = z.object({ packId: z.string().max(20) });

/**
 * Купить минуты для своих видео и аудио книги: покупка по ценам каталога и блок оплаты Kaspi. Оплату подтверждает Kaspi
 * (вебхук или сверка) — минуты добавляются книге сами. Пакет не продаётся (или цена 0) — 404.
 */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  checkOrigin(req);
  const { id } = idParams(await params, "id");
  const { user, book } = await apiBook(req, id, { editable: true });
  const { packId } = body.parse(await req.json());
  if (!(await rateLimit(`media-pack:${user.id}`, 10, 10 * 60_000))) throw new HttpError(429, "kaspiRate");
  await ensureCatalog();
  const pack = getMediaPack(packId);
  if (!pack || pack.hidden || pack.price <= 0) throw new HttpError(404, "notFound");
  const purchase = await createMediaPurchase(user.id, book.id, pack);
  return NextResponse.json({
    purchase: { id: purchase.id, number: purchase.number, minutes: purchase.minutes, amount: purchase.amount },
    kaspi: await kaspiPaymentProps({ kind: "media_pack", id: purchase.id }, user.phone ?? ""),
  });
});
