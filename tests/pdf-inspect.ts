import { spawnSync } from "node:child_process";

/**
 * Чтение готового PDF программами poppler: строки текста с координатами (pdftotext -bbox-layout)
 * и растр полосы (pdftoppm). Координаты — pt от левого верхнего угла полосы (MediaBox).
 */

/** Есть ли программа в системе. */
export const hasTool = (tool: "pdftotext" | "pdftoppm") => !spawnSync(tool, ["-v"]).error;

function run(tool: string, args: string[]) {
  const out = spawnSync(tool, args, { maxBuffer: 256 << 20 });
  if (out.status !== 0) throw new Error(`${tool}: ${out.stderr.toString()}`);
  return out.stdout;
}

export interface TextRow {
  text: string;
  top: number;
  bottom: number;
}

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => entities[e]);

/**
 * Строки текста по полосам, сверху вниз. pdftotext дробит строку на куски (выключка по ширине, разные шрифты),
 * поэтому куски с одной средней линией склеиваются слева направо.
 */
export function textRows(pdfPath: string): TextRow[][] {
  const xml = run("pdftotext", ["-bbox-layout", pdfPath, "-"]).toString("utf8");
  return xml
    .split("<page ")
    .slice(1)
    .map((page) => {
      const lines = [...page.matchAll(/<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="[\d.]+" yMax="([\d.]+)">([\s\S]*?)<\/line>/g)].map((m) => ({
        left: Number(m[1]),
        top: Number(m[2]),
        bottom: Number(m[3]),
        text: [...m[4].matchAll(/<word[^>]*>([^<]*)<\/word>/g)].map((w) => decode(w[1])).join(" "),
      }));
      lines.sort((a, b) => a.top + a.bottom - b.top - b.bottom || a.left - b.left);
      const rows: (TextRow & { mid: number })[] = [];
      for (const l of lines) {
        const mid = (l.top + l.bottom) / 2;
        const row = rows.at(-1);
        if (row && Math.abs(row.mid - mid) < 1.5) {
          row.text += ` ${l.text}`;
          row.top = Math.min(row.top, l.top);
          row.bottom = Math.max(row.bottom, l.bottom);
        } else rows.push({ text: l.text, top: l.top, bottom: l.bottom, mid });
      }
      return rows.map(({ text, top, bottom }) => ({ text, top, bottom }));
    });
}

export interface GrayImage {
  width: number;
  height: number;
  /** Длина строки растра в байтах: справа может остаться неполный пиксель, он не входит в width. */
  stride: number;
  data: Buffer;
}

/**
 * Полоса в оттенках серого (PGM от pdftoppm), только целые пиксели. Неполный пиксель у правого и нижнего края
 * pdftoppm закрашивает белым, даже если фото доходит до края, — поэтому размер считается по размеру полосы в pt.
 */
export function grayPage(pdfPath: string, page: number, dpi: number, sizePt: { width: number; height: number }): GrayImage {
  const pgm = run("pdftoppm", ["-gray", "-r", String(dpi), "-f", String(page), "-l", String(page), pdfPath]);
  const header = /^P5\s+(\d+)\s+(\d+)\s+255\s/.exec(pgm.subarray(0, 32).toString("latin1"));
  if (!header) throw new Error("pdftoppm: не PGM");
  const whole = (pt: number) => Math.floor((pt * dpi) / 72 + 1e-6);
  return { width: whole(sizePt.width), height: whole(sizePt.height), stride: Number(header[1]), data: pgm.subarray(header[0].length) };
}

/** Самый светлый пиксель на каждом краю растра (255 — белый). */
export function edgeMax({ width, height, stride, data }: GrayImage) {
  const max = (pick: (i: number) => number, n: number) => Array.from({ length: n }, (_, i) => data[pick(i)]).reduce((a, b) => Math.max(a, b), 0);
  return {
    top: max((x) => x, width),
    bottom: max((x) => (height - 1) * stride + x, width),
    left: max((y) => y * stride, height),
    right: max((y) => y * stride + width - 1, height),
  };
}
