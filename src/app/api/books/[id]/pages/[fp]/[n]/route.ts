import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { isBuildFingerprint, isPageImageWidth } from "@/lib/book/book-build";
import { RasterizerMissingError } from "@/modules/production";
import { api, apiBook, HttpError } from "@/server/api";
import { container } from "@/server/container";
import { idParams } from "@/server/input";

type Ctx = { params: Promise<{ id: string; fp: string; n: string }> };

/**
 * Картинка полосы n экранной сборки fp (WebP шириной ?w= из PAGE_IMAGE_WIDTHS): растр настоящего PDF, ровно
 * обрезной формат. Сборка с этим отпечатком не меняется — браузер кэширует картинку навсегда. Пока книга не оплачена,
 * картинка со знаком «Предпросмотр» и браузер её перепроверяет (ETag): после оплаты по тому же адресу — без знака.
 */
export const GET = api(async (req, { params }: Ctx) => {
  const { id, fp, n } = idParams(await params, "id");
  const page = /^[1-9]\d{0,3}$/.test(n) ? Number(n) : 0;
  const width = Number(new URL(req.url).searchParams.get("w"));
  if (!isBuildFingerprint(fp) || !page || !isPageImageWidth(width)) throw new HttpError(400, "badRequest");
  await apiBook(req, id);
  // Браузер ушёл (полосу пролистали, вкладку закрыли) — растр, который больше никто не ждёт, снимается с очереди.
  const image = await container()
    .previews.pageImage(id, fp, page, width, req.signal)
    .catch((err: unknown) => {
      if (RasterizerMissingError.is(err)) return "rasterizer" as const;
      if (req.signal.aborted) return "gone" as const;
      throw err;
    });
  if (image === "gone") return new Response(null, { status: 499 });
  if (image === "rasterizer") return NextResponse.json({ error: "rasterizer" }, { status: 503 });
  if (!image) throw new HttpError(404, "notFound");
  const etag = `"${createHash("sha1").update(image.data).digest("base64url").slice(0, 22)}"`;
  const headers = {
    "Content-Type": "image/webp",
    ETag: etag,
    "Cache-Control": image.limited ? "private, no-cache" : "private, max-age=31536000, immutable",
  };
  if (req.headers.get("if-none-match")?.split(/\s*,\s*/).includes(etag)) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(image.data), { headers });
});
