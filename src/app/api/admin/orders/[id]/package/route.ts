import { ZipArchive } from "archiver";
import { PassThrough, Readable } from "node:stream";
import { api, apiStaff, HttpError } from "@/server/api";
import { container } from "@/server/container";

export const maxDuration = 300;

/** ZIP-пакет для типографии: блок, обложка и техзадание. */
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await apiStaff(req, "orders.files");
  const c = container();
  const order = await c.ordering.queries.orderDetails(id);
  if (!order) throw new HttpError(404, "orderNotFound");
  const job = { orderId: order.id, bookId: order.bookId, number: order.number };
  await c.printFiles.prepare(job);
  const [block, cover, layout, spec] = await Promise.all([c.printFiles.getFile(job, "block"), c.printFiles.getFile(job, "cover"), c.printFiles.getFile(job, "layout"), c.printFiles.getFile(job, "spec")]);
  const zip = new ZipArchive({ zlib: { level: 6 } });
  const out = new PassThrough();
  zip.pipe(out);
  const dir = `order-${order.number}`;
  zip.append(block, { name: `${dir}/block.pdf` });
  zip.append(cover, { name: `${dir}/cover.pdf` });
  zip.append(layout, { name: `${dir}/layout.pdf` });
  zip.append(spec, { name: `${dir}/spec.txt` });
  void zip.finalize();
  return new Response(Readable.toWeb(out) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${dir}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
});
