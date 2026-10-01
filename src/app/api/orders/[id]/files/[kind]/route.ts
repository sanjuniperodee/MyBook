import { api, apiUser, HttpError } from "@/lib/api";
import { can, getStaff } from "@/lib/crm/rbac";
import { container } from "@/server/container";
import type { PrintFileKind as OrderFileKind } from "@/modules/production";
import { getPlan } from "@/config/site";

export const maxDuration = 300;

const kinds: Record<OrderFileKind, { type: string; name: (n: number) => string }> = {
  reading: { type: "application/pdf", name: (n) => `mybook-${n}.pdf` },
  block: { type: "application/pdf", name: (n) => `order-${n}-block.pdf` },
  cover: { type: "application/pdf", name: (n) => `order-${n}-cover.pdf` },
  spec: { type: "text/plain; charset=utf-8", name: (n) => `order-${n}-spec.txt` },
};

export const GET = api(async (req, { params }: { params: Promise<{ id: string; kind: string }> }) => {
  const { id, kind } = await params;
  if (!(kind in kinds)) throw new HttpError(404, "notFound");
  const user = await apiUser(req);
  const c = container();
  const order = await c.ordering.queries.orderDetails(id);
  if (!order) throw new HttpError(404, "orderNotFound");
  // Сотруднику нужны права: читательская версия — orders.view, файлы для типографии — orders.files.
  const staff = await getStaff();
  const isAdmin = can(staff, kind === "reading" ? "orders.view" : "orders.files");
  if (!isAdmin) {
    if (order.userId !== user.id) throw new HttpError(404, "orderNotFound");
    const paid = !["pending_payment", "cancelled"].includes(order.status);
    const digital = !getPlan(order.plan)?.printed;
    // Покупателю доступна читательская версия после оплаты; файлы для печати — в электронном тарифе.
    if (!paid || (kind !== "reading" && !digital)) throw new HttpError(403, "fileNotReady");
  }
  const force = isAdmin && new URL(req.url).searchParams.get("regenerate") === "1";
  const data = await c.printFiles.getFile({ orderId: order.id, bookId: order.bookId, number: order.number }, kind as OrderFileKind, { force });
  const meta = kinds[kind as OrderFileKind];
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": meta.type,
      "Content-Disposition": `attachment; filename="${meta.name(order.number)}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
