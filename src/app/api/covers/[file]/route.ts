import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { notFound } from "next/navigation";
import { coverTemplates, getCoverTemplate, renderCoverSvg } from "@/lib/book/covers";
import { coverFrontGeometry, formats, getFormat } from "@/lib/book/formats";

/**
 * Фон обложки (без текста) отдельным SVG-файлом: браузер кэширует его навсегда — версия в адресе
 * меняется вместе с кодом рисунков (COVER_ART_VERSION в next.config). Так одна и та же обложка
 * не встраивается в HTML страницы несколько раз по 200 КБ.
 *
 * Сжимаем сами и держим готовые варианты в памяти: рисунки обложек — до 220 КБ SVG, а сжатие
 * Next к ответам обработчиков маршрутов из кэша не применяется.
 */
const FILE = /^([a-z]+)-([a-z0-9]+)(-lite)?\.svg$/;
const cache = new Map<string, { raw: string; br: Buffer; gzip: Buffer }>();

function art(file: string) {
  const hit = cache.get(file);
  if (hit) return hit;
  const m = FILE.exec(file);
  if (!m || !coverTemplates.some((t) => t.id === m[1]) || !(m[2] in formats)) return null;
  const template = getCoverTemplate(m[1]);
  const format = getFormat(m[2]);
  const raw = renderCoverSvg(template, coverFrontGeometry(format), { uid: `${template.id}${format.id}` }, { noTexture: !!m[3] });
  const entry = { raw, br: brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }), gzip: gzipSync(raw, { level: 9 }) };
  cache.set(file, entry);
  return entry;
}

export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const entry = art((await params).file);
  if (!entry) notFound();
  const accept = req.headers.get("accept-encoding") ?? "";
  const [body, encoding] = /\bbr\b/.test(accept) ? [entry.br, "br"] : /\bgzip\b/.test(accept) ? [entry.gzip, "gzip"] : [entry.raw, null];
  return new Response(typeof body === "string" ? body : new Uint8Array(body), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
      Vary: "Accept-Encoding",
      ...(encoding ? { "Content-Encoding": encoding } : {}),
    },
  });
}
