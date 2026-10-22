import { api, apiUser, HttpError } from "@/server/api";
import { can, canSeeOrder, getStaff } from "@/server/access";
import { container } from "@/server/container";
import { idParams } from "@/server/input";

/**
 * Ход сборки PDF заказа (блок, обложка, читательская версия): экран спрашивает его раз в секунду, пока ждёт файл.
 * Видят владелец заказа и сотрудники, которым открыты его файлы, — как и сами файлы.
 */
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  const user = await apiUser(req);
  const c = container();
  const order = await c.ordering.queries.orderDetails(id);
  if (!order) throw new HttpError(404, "orderNotFound");
  const staff = await getStaff();
  const staffSees = !!staff && (can(staff, "orders.view") || can(staff, "orders.files")) && (await canSeeOrder(staff, order.id));
  if (order.userId !== user.id && !staffSees) throw new HttpError(404, "orderNotFound");
  return Response.json({ jobs: c.renderProgress.forOrder(order.id) }, { headers: { "Cache-Control": "private, no-store" } });
});
