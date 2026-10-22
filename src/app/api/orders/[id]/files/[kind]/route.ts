import { api, apiUser, HttpError } from "@/server/api";
import { can, canSeeOrder, getStaff } from "@/server/access";
import { container } from "@/server/container";
import type { PrintFileKind as OrderFileKind } from "@/modules/production";
import { canDownloadFile, type OrderFile } from "@/modules/ordering/domain";
import { getPlan } from "@/config/site";
import { idParams } from "@/server/input";

export const maxDuration = 300;

const kinds: Record<OrderFile & OrderFileKind, { type: string; name: (n: number) => string }> = {
  reading: { type: "application/pdf", name: (n) => `mybook-${n}.pdf` },
  block: { type: "application/pdf", name: (n) => `order-${n}-block.pdf` },
  cover: { type: "application/pdf", name: (n) => `order-${n}-cover.pdf` },
  layout: { type: "application/pdf", name: (n) => `order-${n}-layout.pdf` },
  spec: { type: "text/plain; charset=utf-8", name: (n) => `order-${n}-spec.txt` },
};

export const GET = api(async (req, { params }: { params: Promise<{ id: string; kind: string }> }) => {
  const { id, kind } = idParams(await params, "id");
  if (!Object.hasOwn(kinds, kind)) throw new HttpError(404, "notFound");
  const user = await apiUser(req);
  const c = container();
  const order = await c.ordering.queries.orderDetails(id);
  if (!order) throw new HttpError(404, "orderNotFound");
  const staff = await getStaff();
  // Роль «только свои» качает файлы только заказов своих клиентов; свой заказ покупатель качает как обычно.
  const staffSees = !!staff && (can(staff, "orders.view") || can(staff, "orders.files")) && (await canSeeOrder(staff, order.id));
  const access = canDownloadFile(order, getPlan(order.plan), kind as OrderFile, { userId: user.id, can: (p) => staffSees && can(staff, p) });
  if (access === "notFound") throw new HttpError(404, "orderNotFound");
  if (access === "notReady") throw new HttpError(403, "fileNotReady");
  const query = new URL(req.url).searchParams;
  const force = access === "staff" && query.get("regenerate") === "1";
  const job = { orderId: order.id, bookId: order.bookId, number: order.number };
  // prepare=1 — только собрать файл: страница ждёт готовности, показывая ход сборки (render-progress), а скачивание потом идёт из кэша.
  if (query.get("prepare") === "1") {
    await c.printFiles.ensure(job, kind as OrderFileKind, { force });
    return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
  }
  const data = await c.printFiles.getFile(job, kind as OrderFileKind, { force });
  const meta = kinds[kind as OrderFileKind];
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": meta.type,
      "Content-Disposition": `attachment; filename="${meta.name(order.number)}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
