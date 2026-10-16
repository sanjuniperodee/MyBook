import { NextResponse } from "next/server";
import { api, apiUser, checkOrigin, HttpError } from "@/server/api";
import { container } from "@/server/container";
import { isPayToken, type InvoiceOwner } from "@/modules/ordering";
import { invoiceView } from "../../view";
import { idParams } from "@/server/input";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Сертификат и счёт из чата оплачивают по секретной ссылке (без аккаунта), заказ — только владелец. По ссылке ?pay=
 * не требуем входа и не отвечаем 401: иначе apiFetch уведёт плательщика на страницу входа.
 */
async function ownerOf(req: Request): Promise<InvoiceOwner> {
  const params = new URL(req.url).searchParams;
  const pay = params.get("pay");
  if (pay !== null) {
    if (!isPayToken(pay)) throw new HttpError(404, "invoiceNotFound");
    return { dealInvoiceToken: pay };
  }
  const giftToken = params.get("token");
  return giftToken ? { giftToken } : { userId: (await apiUser(req)).id };
}

/** Состояние счёта: страница оплаты опрашивает его, пока клиент платит в Kaspi. */
export const GET = api(async (req, { params }: Ctx) => {
  const { id } = idParams(await params, "id");
  const invoice = await container().ordering.kaspi.status(id, await ownerOf(req));
  return NextResponse.json({ invoice: await invoiceView(invoice) });
});

/** Отменить счёт (клиент выбрал другой способ оплаты). */
export const DELETE = api(async (req, { params }: Ctx) => {
  checkOrigin(req);
  const { id } = idParams(await params, "id");
  await container().ordering.kaspi.cancel(id, await ownerOf(req));
  return NextResponse.json({ ok: true });
});
