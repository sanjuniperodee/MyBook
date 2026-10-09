import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { notFound } from "next/navigation";
import { coverTemplates, cropSvg, getCoverTemplate, renderCoverSvg } from "@/lib/book/covers";
import { coverFrontGeometry, coverSpreadGeometry, formats, getFormat } from "@/lib/book/formats";

/**
 * Фон обложки (без текста) отдельным SVG-файлом: браузер кэширует его навсегда — версия в адресе
 * меняется вместе с кодом рисунков (COVER_ART_VERSION в next.config). Так одна и та же обложка
 * не встраивается в HTML страницы несколько раз по 200 КБ.
 *
 * Сжимаем сами и держим готовые варианты в памяти: рисунки обложек — до 220 КБ SVG, а сжатие
 * Next к ответам обработчиков маршрутов из кэша не применяется.
 */
const FILE = /^([a-z]+)-([a-z0-9]+)(-lite)?(-back|-backplain)?\.svg$/;
/** Толщина книги для фона задней крышки в редакторе: от неё зависит только стык узора с корешком. */
const PREVIEW_PAGES = 120;
const cache = new Map<string, { raw: string; br: Buffer; gzip: Buffer }>();

function art(file: string) {
  const hit = cache.get(file);
  if (hit) return hit;
  const m = FILE.exec(file);
  if (!m || !coverTemplates.some((t) => t.id === m[1]) || !(m[2] in formats)) return null;
  const template = getCoverTemplate(m[1]);
  const format = getFormat(m[2]);
  let raw: string;
  if (m[4]) {
    // Задняя крышка — кусок развёртки: так её узор и повтор композиции лица такие же, как в печати.
    const g = coverSpreadGeometry(format, PREVIEW_PAGES);
    // -backplain — без повтора композиции лица: под карточками «Полароидов» на обороте.
    raw = cropSvg(renderCoverSvg(template, g, { uid: `${template.id}${format.id}b` }, { noTexture: !!m[3], plainBack: m[4] === "-backplain" }), g.back!, { w: g.width, h: g.height });
  } else raw = renderCoverSvg(template, coverFrontGeometry(format), { uid: `${template.id}${format.id}` }, { noTexture: !!m[3] });
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
