import { NextResponse } from "next/server";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";
import { mobileOrder } from "@/server/crm-lists/orders";

/** Карточка заказа для производства — та же выборка, что crmOrder в API v1. */
export const GET = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "orders.view");
  const { id } = idParams(await params, "id");
  return NextResponse.json(await mobileOrder(staff, id));
});
