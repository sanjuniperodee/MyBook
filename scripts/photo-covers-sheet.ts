/**
 * Лист с фонами всех обложек на снимках (лицо A5 и развёртка) — для проверки кадра после правок раскладки.
 * Запуск: npx tsx scripts/photo-covers-sheet.ts <out.jpg> [id,...]
 */
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { allCoverTemplates, renderCoverSvg } from "@/lib/book/covers";
import { coverFrontGeometry, coverSpreadGeometry, getFormat } from "@/lib/book/formats";
import { plateRect } from "@/lib/book/photo-cover";

const [out = "photo-covers.jpg", only] = process.argv.slice(2);
const list = allCoverTemplates.filter((t) => t.photo && (!only || only.split(",").includes(t.id)));
const H = 300;
const tiles: { input: Buffer; left: number; top: number }[] = [];
const format = getFormat("a5");
const front = coverFrontGeometry(format);
const spread = coverSpreadGeometry(format, 120);
const fw = Math.round((H * front.width) / front.height);
const sw = Math.round((H * spread.width) / spread.height);
const cols = 2;
const cellW = fw + sw + 30;

for (const [i, t] of list.entries()) {
  const small = await sharp(readFileSync(`assets/cover-photos/${t.photo!.photo.key}.jpg`)).resize(1400, 1400, { fit: "inside" }).jpeg().toBuffer();
  const imageHref = `data:image/jpeg;base64,${small.toString("base64")}`;
  // Область текста — пунктиром, чтобы видеть, куда ляжет надпись.
  const ta = t.textArea;
  const box = (g: typeof front) => {
    const f = g.front;
    return `<rect x="${f.x + ta.x * f.w}" y="${f.y + ta.y * f.h}" width="${ta.w * f.w}" height="${ta.h * f.h}" fill="none" stroke="#ff2d55" stroke-width="0.6" stroke-dasharray="2 1.5"/>`;
  };
  const raster = async (g: typeof front, w: number) => {
    const svg = renderCoverSvg(t, g, { uid: `s${t.id}`, imageHref }).replace("</svg>", `${box(g)}</svg>`);
    return sharp(Buffer.from(svg), { density: (72 * w) / g.width }).resize(w, H, { fit: "fill" }).jpeg().toBuffer();
  };
  const x = (i % cols) * cellW;
  const y = Math.floor(i / cols) * (H + 26);
  const label = Buffer.from(`<svg width="${cellW}" height="24"><rect width="100%" height="100%" fill="#000"/><text x="6" y="17" font-size="15" fill="#fff" font-family="Arial">${t.id}${t.photo!.plate ? ` · плашка ${plateRect(t.photo!.plate, ta, front.front).w.toFixed(0)} мм` : ""}</text></svg>`);
  tiles.push({ input: label, left: x, top: y });
  tiles.push({ input: await raster(front, fw), left: x, top: y + 24 });
  tiles.push({ input: await raster(spread, sw), left: x + fw + 10, top: y + 24 });
}
const rows = Math.ceil(list.length / cols);
await sharp({ create: { width: cols * cellW, height: rows * (H + 26), channels: 3, background: "#222" } })
  .composite(tiles)
  .jpeg({ quality: 80 })
  .toFile(out);
console.log(out, list.length);
