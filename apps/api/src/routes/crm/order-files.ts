/**
 * Файлы заказа для типографии в приложении CRM: параметры печати и ссылки на файлы сайта (вёрстка — процессом сайта, как
 * при скачивании из CRM); открыть или закрыть книгу для правок — то же действие, что кнопка в карточке заказа.
 */
import { getFormat } from "@/lib/book/formats";
import { apiStaff, HttpError } from "@/server/api";
import { can, canSeeOrder } from "@/server/access";
import { container } from "@/server/container";
import { toggleBookLockAction } from "@/app/admin/actions";
import type { Handlers } from "../../app";

const FILES = [
  { kind: "block", label: "Блок книги", perm: "orders.files" },
  { kind: "cover", label: "Обложка", perm: "orders.files" },
  { kind: "layout", label: "Каркас обложки", perm: "orders.files" },
  { kind: "spec", label: "Техзадание", perm: "orders.files" },
  { kind: "reading", label: "PDF для чтения", perm: "orders.view" },
] as const;

export const crmOrderFileHandlers: Pick<Handlers, "crmOrderFiles" | "crmOrderBookLock"> = {
  async crmOrderFiles({ req, input }) {
    const staff = await apiStaff(req, "orders.view");
    const order = await container().ordering.queries.orderDetails(input.orderId);
    if (!order || !(await canSeeOrder(staff, order.id))) throw new HttpError(404, "notFound");
    const spec = order.printSpec;
    const canFiles = can(staff, "orders.files");
    return {
      canFiles,
      spec: spec
        ? { format: getFormat(spec.format).short, pages: spec.pageCount, spineMm: spec.spineMm, coverWidthMm: spec.coverWidthMm, coverHeightMm: spec.coverHeightMm, generatedAt: spec.generatedAt }
        : null,
      files: FILES.filter((f) => can(staff, f.perm)).map((f) => ({ kind: f.kind, label: f.label, url: `/api/orders/${order.id}/files/${f.kind}` })),
      packageUrl: canFiles ? `/api/admin/orders/${order.id}/package` : null,
      progressUrl: `/api/orders/${order.id}/render-progress`,
      bookLocked: order.book.status !== "draft",
      canLock: can(staff, "orders.edit"),
    };
  },

  async crmOrderBookLock({ req, input }) {
    await apiStaff(req, "orders.edit");
    const order = await container().ordering.queries.orderDetails(input.orderId);
    if (!order) throw new HttpError(404, "notFound");
    // Кнопка сайта переключает; здесь — нужное состояние: повтор запроса не открывает обратно.
    const locked = order.book.status !== "draft";
    if (locked !== input.body.locked) await toggleBookLockAction(order.id);
    return { ok: true, message: input.body.locked ? "Книга закрыта для правок" : "Книга открыта для правок клиентом" };
  },
};
