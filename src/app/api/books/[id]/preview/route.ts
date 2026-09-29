import { createHash } from "node:crypto";
import { api, apiBook, HttpError } from "@/lib/api";
import { contentFor, loadBookBundle, renderInterior } from "@/lib/pdf/render";
import { dedupe, withRenderSlot } from "@/lib/pdf/queue";
import { deletePrefix, fileExists, getFile, putFile } from "@/lib/storage";

export const maxDuration = 120;

/** PDF-предпросмотр блока (с водяным знаком и облегчёнными фото). Кэшируется, пока книга не изменилась. */
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await apiBook(req, id);
  const bundle = await loadBookBundle(id);
  if (!bundle) throw new HttpError(404, "Книга не найдена");

  const fingerprint = createHash("sha1")
    .update(JSON.stringify(contentFor(bundle)))
    .update(bundle.photos.map((p) => `${p.id}:${p.layout}:${p.caption}`).join("|"))
    .digest("hex")
    .slice(0, 16);
  const key = `cache/preview/${id}/${fingerprint}.pdf`;

  let pdf: Buffer;
  if (await fileExists(key)) {
    pdf = await getFile(key);
  } else {
    pdf = await dedupe(key, () =>
      withRenderSlot(async () => {
        const res = await renderInterior(bundle, "preview");
        await deletePrefix(`cache/preview/${id}`);
        await putFile(key, res.pdf);
        return res.pdf;
      }),
    );
  }
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="preview.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});
