/**
 * Файлы заказа для типографии в приложении CRM: параметры печати и ссылки на файлы сайта (вёрстка — процессом сайта, как
 * при скачивании из CRM); открыть или закрыть книгу для правок — то же действие, что кнопка в карточке заказа.
 */
import { getFormat } from "@/lib/book/formats";
import { apiStaff, HttpError } from "@/server/api";
import { can, canSeeOrder, contactView } from "@/server/access";
import { deliveryLabels } from "@/modules/ordering/ui/labels";
import { refused } from "./common";
import { container } from "@/server/container";
import { toggleBookLockAction, updateOrderDetailsAction } from "@/app/admin/actions";
import type { Handlers } from "../../app";

const FILES = [
  { kind: "block", label: "Блок книги", perm: "orders.files" },
  { kind: "cover", label: "Обложка", perm: "orders.files" },
  { kind: "layout", label: "Каркас обложки", perm: "orders.files" },
  { kind: "spec", label: "Техзадание", perm: "orders.files" },
  { kind: "reading", label: "PDF для чтения", perm: "orders.view" },
] as const;

export const crmOrderFileHandlers: Pick<Handlers, "crmOrderFiles" | "crmOrderBookLock" | "crmOrderDetails" | "crmOrderDetailsUpdate"> = {
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
      canRegenerate: canFiles,
    };
  },

  async crmOrderDetails({ req, input }) {
    const staff = await apiStaff(req, "orders.view");
    const order = await container().ordering.queries.orderDetails(input.orderId);
    if (!order || !(await canSeeOrder(staff, order.id))) throw new HttpError(404, "notFound");
    // Скрытые ролью контакты не показываем и не даём перезаписать маской — как на сайте (форма только при !masked).
    const contact = contactView(staff, { phone: order.contactPhone, email: order.contactEmail });
    return {
      canEdit: can(staff, "orders.edit") && !contact.masked,
      contactName: order.contactName,
      contactPhone: contact.phone ?? "",
      contactEmail: contact.email ?? "",
      deliveryMethod: (order.deliveryMethod as "pickup" | "courier" | "post" | "abroad" | null) ?? null,
      deliveryMethods: Object.entries(deliveryLabels).map(([id, label]) => ({ id, label })),
      country: order.deliveryCountry ?? null,
      city: order.city ?? null,
      address: order.address ?? null,
      postalCode: order.postalCode ?? null,
      desiredDate: order.desiredDate ?? null,
      giftNote: order.giftNote ?? null,
    };
  },

  async crmOrderDetailsUpdate({ req, input }) {
    await apiStaff(req, "orders.edit");
    const b = input.body;
    const form = new FormData();
    form.set("orderId", input.orderId);
    form.set("contactName", b.contactName);
    form.set("contactPhone", b.contactPhone);
    form.set("contactEmail", b.contactEmail);
    form.set("deliveryMethod", b.deliveryMethod ?? "");
    for (const k of ["country", "city", "address", "postalCode", "desiredDate", "giftNote"] as const) form.set(k, b[k] ?? "");
    const r = await updateOrderDetailsAction({}, form);
    if (r.error) return refused(r.error);
    return { ok: true, message: r.ok ?? "Сохранено" };
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
