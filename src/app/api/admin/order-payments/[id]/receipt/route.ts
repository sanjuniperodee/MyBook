import { api, apiStaff, HttpError } from "@/server/api";
import { audit, canSeeOrder } from "@/server/access";
import { container } from "@/server/container";
import { idParams } from "@/server/input";

/** Чек оплаты заказа — сотрудникам с правом видеть заказы; просмотр — в журнал. */
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "orders.view");
  const { id } = idParams(await params, "id");
  const file = await container().ordering.payments.receipt(id);
  if (!file || !(await canSeeOrder(staff, file.payment.orderId))) throw new HttpError(404, "notFound");
  await audit(staff, "receipt.view", "order", file.payment.orderId, { payment: id });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.payment.receipt!.mime,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.payment.receipt!.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    },
  });
});
