"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/web/auth";
import { uuid } from "@/web/input";
import { v1WebAction } from "@/web/api";

/** Клиент сообщает, что оплатил переводом — администратор проверит поступление. */
export async function claimPaymentAction(rawOrderId: string) {
  await requireUser();
  const orderId = uuid.parse(rawOrderId);
  await v1WebAction({
    section: "orders",
    viaApi: (api) => api.cabinetOrderClaim({ orderId }),
  });
  revalidatePath(`/orders/${orderId}`);
}

export async function cancelOrderAction(rawOrderId: string) {
  await requireUser();
  const orderId = uuid.parse(rawOrderId);
  await v1WebAction({
    section: "orders",
    viaApi: (api) => api.cabinetOrderCancel({ orderId }),
  });
  revalidatePath(`/orders/${orderId}`);
}
