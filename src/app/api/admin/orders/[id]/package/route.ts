import { ZipArchive } from "archiver";
import { PassThrough, Readable } from "node:stream";
import { api, apiStaff, HttpError } from "@/lib/api";
import { ensurePrintFiles, getOrderWithBook } from "@/lib/orders";
import { getFile } from "@/lib/storage";

export const maxDuration = 300;

/** ZIP-пакет для типографии: блок, обложка и техзадание. */
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await apiStaff(req, "orders.files");
  const order = await getOrderWithBook(id);
  if (!order) throw new HttpError(404, "orderNotFound");
  const keys = await ensurePrintFiles(order);
  const [block, cover, spec] = await Promise.all([getFile(keys.block), getFile(keys.cover), getFile(keys.spec)]);
  const zip = new ZipArchive({ zlib: { level: 6 } });
  const out = new PassThrough();
  zip.pipe(out);
  const dir = `order-${order.number}`;
  zip.append(block, { name: `${dir}/block.pdf` });
  zip.append(cover, { name: `${dir}/cover.pdf` });
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
