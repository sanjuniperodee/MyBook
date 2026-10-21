import { NextResponse } from "next/server";
import { z } from "zod";
import { moveOrderAction } from "@/app/admin/actions";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";
import { ORDER_STATUSES } from "@/shared/domain/orders";

export const dynamic = "force-dynamic";

/** Перевести заказ в другой статус (клиент получит письмо или сообщение, как при переносе карточки на доске CRM). */
export const POST = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req, "orders.view", "orders.edit");
  const { id } = idParams(await params, "id");
  const { status } = z.object({ status: z.enum(ORDER_STATUSES) }).parse(await req.json());
  const r = await moveOrderAction(id, status);
  return NextResponse.json(r, { status: r.error ? 400 : 200 });
});
