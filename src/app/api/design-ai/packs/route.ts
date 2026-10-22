import { NextResponse } from "next/server";
import { z } from "zod";
import { api, apiUser, HttpError } from "@/server/api";
import { rateLimit } from "@/server/rateLimit";
import { getAiPack } from "@/config/site";
import { ensureCatalog } from "@/server/catalog";
import { createDesignAiPurchase } from "@/server/designAiStore";
import { kaspiPaymentProps } from "@/app/api/payments/kaspi/view";

const body = z.object({ packId: z.string().max(20) });

/**
 * Купить пакет запросов к ИИ-дизайнеру: покупка по ценам каталога и блок оплаты Kaspi (счёт в приложение или QR). Оплату
 * подтверждает Kaspi (вебхук или сверка) — запросы начисляются сами. kaspi null — оплата через Kaspi сейчас недоступна.
 */
export const POST = api(async (req) => {
  const user = await apiUser(req);
  const { packId } = body.parse(await req.json());
  if (!(await rateLimit(`design-ai-pack:${user.id}`, 10, 10 * 60_000))) throw new HttpError(429, "kaspiRate");
  await ensureCatalog();
  const pack = getAiPack(packId);
  if (!pack || pack.hidden) throw new HttpError(404, "notFound");
  const purchase = await createDesignAiPurchase(user.id, pack);
  return NextResponse.json({
    purchase: { id: purchase.id, number: purchase.number, requests: purchase.requests, amount: purchase.amount },
    kaspi: await kaspiPaymentProps({ kind: "ai_pack", id: purchase.id }, user.phone ?? ""),
  });
});
