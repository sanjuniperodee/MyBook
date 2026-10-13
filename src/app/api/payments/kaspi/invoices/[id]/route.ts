import { NextResponse } from "next/server";
import { api, apiUser, checkOrigin } from "@/server/api";
import { container } from "@/server/container";
import type { InvoiceOwner } from "@/modules/ordering";
import { invoiceView } from "../../view";

type Ctx = { params: Promise<{ id: string }> };

/** Сертификат оплачивают по секретной ссылке (можно без аккаунта), заказ — только владелец. */
async function ownerOf(req: Request): Promise<InvoiceOwner> {
  const giftToken = new URL(req.url).searchParams.get("token");
  return giftToken ? { giftToken } : { userId: (await apiUser(req)).id };
}

/** Состояние счёта: страница оплаты опрашивает его, пока клиент платит в Kaspi. */
export const GET = api(async (req, { params }: Ctx) => {
  const { id } = await params;
  const invoice = await container().ordering.kaspi.status(id, await ownerOf(req));
  return NextResponse.json({ invoice: await invoiceView(invoice) });
});

/** Отменить счёт (клиент выбрал другой способ оплаты). */
export const DELETE = api(async (req, { params }: Ctx) => {
  checkOrigin(req);
  const { id } = await params;
  await container().ordering.kaspi.cancel(id, await ownerOf(req));
  return NextResponse.json({ ok: true });
});
