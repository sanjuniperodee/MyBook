import { api, apiUser, HttpError } from "@/server/api";
import { can, canSeeOrder, getStaff } from "@/server/access";
import { container } from "@/server/container";
import type { PrintFileKind as OrderFileKind } from "@/modules/production";
import { canDownloadFile, type OrderFile } from "@/modules/ordering/domain";
import { getPlan } from "@/config/site";
import { idParams } from "@/server/input";
import { fileRoute } from "@/server/file-route";
import { serveStorageFile } from "@/server/range-file";

export const maxDuration = 300;

const kinds: Record<OrderFile & OrderFileKind, { type: string; name: (n: number) => string }> = {
  reading: { type: "application/pdf", name: (n) => `mybook-${n}.pdf` },
  block: { type: "application/pdf", name: (n) => `order-${n}-block.pdf` },
  cover: { type: "application/pdf", name: (n) => `order-${n}-cover.pdf` },
  layout: { type: "application/pdf", name: (n) => `order-${n}-layout.pdf` },
  spec: { type: "text/plain; charset=utf-8", name: (n) => `order-${n}-spec.txt` },
};

export const GET = fileRoute("order-file", api(async (req, { params }: { params: Promise<{ id: string; kind: string }> }) => {
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
  const job = { orderId: order.id, bookId: order.bookId, number: order.number, plan: order.plan, quantity: order.quantity };
  // prepare=1 — только собрать файл: страница ждёт готовности, показывая ход сборки (render-progress), а скачивание потом идёт из кэша.
  if (query.get("prepare") === "1") {
    // Пересборка из приложения CRM (prepare=1&regenerate=1, право «Файлы заказа»): то же, что кнопка «Перегенерировать
    // файлы» карточки заказа — пакет заново, параметры печати и запись в журнал заказа; вёрстка — процессом сайта.
    if (force && kind !== "reading" && staff && can(staff, "orders.files")) {
      await c.ordering.orders.regeneratePrintFiles(order.id, { label: `admin:${staff.user.email}`, userId: staff.user.id });
      if (kind === "layout") await c.printFiles.ensure(job, "layout");
      return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
    }
    await c.printFiles.ensure(job, kind as OrderFileKind, { force });
    return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
  }
  // Готовый файл — потоком из хранилища (с Range) или через mybook-files, а не целиком в память сайта: блок — десятки МБ.
  const meta = kinds[kind as OrderFileKind];
  const key = await c.printFiles.fileKey(job, kind as OrderFileKind, { force });
  const headers = { "Content-Disposition": `attachment; filename="${meta.name(order.number)}"`, "Cache-Control": "private, no-store" };
  const res = await serveStorageFile(key, meta.type, req, headers, (r) => c.printFiles.openKey(key, r));
  if (!res) throw new HttpError(404, "notFound");
  return res;
}));
