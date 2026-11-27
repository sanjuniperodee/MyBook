import { apiStaff } from "@/server/api";
import { mobile } from "@/server/mobile-api";
import { mobileOrders } from "@/server/crm-lists/orders";

/** Заказы для производства (канбан доски CRM) — та же выборка, что crmOrdersList в API v1. */
export const GET = mobile(async (req) => Response.json(await mobileOrders(await apiStaff(req, "orders.view"))));
