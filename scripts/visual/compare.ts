/**
 * Сверка двух снимков (S3, S4) — pdf-snapshot или html-snapshot: эталон <ref> и текущий <cur>.
 * Отличие — любое: ключа нет в одном из снимков, другое число страниц, другая ошибка сборки, хотя бы один
 * пиксель (порог 0). Для различающихся страниц — PNG в <cur>/diff/: отличающиеся пиксели красным поверх
 * бледной текущей страницы.
 *
 * Запуск: npx tsx scripts/visual/compare.ts <ref> <cur> — код выхода 1 при любом отличии, 2 — при ошибке.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { keyDir, pagePath, readManifest, readPixels, type ManifestEntry, type Pixels } from "./shared";

export interface Difference {
  key: string;
  text: string;
  /** PNG-диффы различающихся страниц. */
  diffs: string[];
}

export interface CompareReport {
  keys: number;
  pages: number;
  differences: Difference[];
}

/** Доля исходного цвета на совпадающих пикселях дифф-картинки: остальное — белый. */
const FADE = 0.25;

/** Дифф двух страниц: совпавшие пиксели — бледная текущая страница, остальные (и выходящие за меньшую) — красные. */
export async function diffImage(ref: Pixels, cur: Pixels): Promise<{ png: Buffer; changed: number }> {
  const width = Math.max(ref.width, cur.width);
  const height = Math.max(ref.height, cur.height);
  const out = Buffer.alloc(width * height * 4);
  let changed = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const a = x < ref.width && y < ref.height ? (y * ref.width + x) * 4 : -1;
      const b = x < cur.width && y < cur.height ? (y * cur.width + x) * 4 : -1;
      if (a >= 0 && b >= 0 && ref.data.readUInt32BE(a) === cur.data.readUInt32BE(b)) {
        for (let c = 0; c < 3; c++) out[o + c] = Math.round(255 - (255 - cur.data[b + c]) * FADE);
      } else {
        out[o] = 255;
        changed++;
      }
      out[o + 3] = 255;
    }
  }
  return { png: await sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer(), changed };
}

async function comparePages(key: string, ref: ManifestEntry, cur: ManifestEntry, dirs: { ref: string; cur: string; diff: string }): Promise<Difference | null> {
  const notes: string[] = [];
  const diffs: string[] = [];
  if (ref.pages !== cur.pages) notes.push(`страниц ${ref.pages} → ${cur.pages}`);
  for (let i = 0; i < Math.min(ref.pages, cur.pages); i++) {
    if (ref.sha256[i] === cur.sha256[i]) continue;
    const [a, b] = await Promise.all([readPixels(pagePath(keyDir(dirs.ref, key), i)), readPixels(pagePath(keyDir(dirs.cur, key), i))]);
    const { png, changed } = await diffImage(a, b);
    const file = pagePath(keyDir(dirs.diff, key), i);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, png);
    const size = a.width === b.width && a.height === b.height ? "" : `, размер ${a.width}×${a.height} → ${b.width}×${b.height}`;
    notes.push(`стр. ${i + 1}: ${changed} пикс.${size}`);
    diffs.push(file);
  }
  return notes.length ? { key, text: notes.join("; "), diffs } : null;
}

/** Сравнивает снимки по манифестам; диффы пишет в <cur>/diff/ (прежние удаляются). */
export async function compareSnapshots(refDir: string, curDir: string): Promise<CompareReport> {
  const [ref, cur] = await Promise.all([readManifest(refDir), readManifest(curDir)]);
  const dirs = { ref: refDir, cur: curDir, diff: path.join(curDir, "diff") };
  await rm(dirs.diff, { recursive: true, force: true });
  const keys = [...new Set([...Object.keys(ref), ...Object.keys(cur)])].sort();
  const differences: Difference[] = [];
  let pages = 0;
  for (const key of keys) {
    const a = ref[key];
    const b = cur[key];
    if (!a || !b) {
      differences.push({ key, text: a ? "нет в текущем снимке" : "нет в эталоне", diffs: [] });
      continue;
    }
    pages += Math.max(a.pages, b.pages);
    if (a.error !== b.error) differences.push({ key, text: `ошибка сборки: ${a.error ?? "нет"} → ${b.error ?? "нет"}`, diffs: [] });
    else {
      const d = await comparePages(key, a, b, dirs);
      if (d) differences.push(d);
    }
  }
  return { keys: keys.length, pages, differences };
}

async function main() {
  const [ref, cur] = process.argv.slice(2);
  if (!ref || !cur) {
    console.error("Запуск: compare.ts <эталон> <текущий>");
    process.exitCode = 2;
    return;
  }
  const report = await compareSnapshots(path.resolve(ref), path.resolve(cur));
  for (const d of report.differences) console.log(`✗ ${d.key} — ${d.text}${d.diffs.length ? `\n  ${d.diffs[0]}${d.diffs.length > 1 ? ` и ещё ${d.diffs.length - 1}` : ""}` : ""}`);
  const total = `ключей ${report.keys}, страниц ${report.pages}`;
  console.log(report.differences.length ? `Отличия: ключей с отличиями ${report.differences.length}; всего ${total}` : `Отличий нет: ${total}`);
  process.exitCode = report.differences.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 2;
  });
}
