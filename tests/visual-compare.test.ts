import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { compareSnapshots } from "../scripts/visual/compare";
import { entryFor, keyDir, pagePath, pixelHash, readPixels, ROOT, writeManifest, type Manifest } from "../scripts/visual/shared";

const root = mkdtempSync(path.join(tmpdir(), "mybook-visual-compare-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const W = 4;
const H = 3;

/** Страница W×H одного цвета; changed — пиксели [x, y], перекрашенные в чёрный. */
function page(rgb: [number, number, number], changed: [number, number][] = [], size = { w: W, h: H }) {
  const data = Buffer.alloc(size.w * size.h * 4);
  for (let i = 0; i < size.w * size.h; i++) data.set([...rgb, 255], i * 4);
  for (const [x, y] of changed) data.set([0, 0, 0, 255], (y * size.w + x) * 4);
  return { data, ...size };
}
type Page = ReturnType<typeof page>;

const png = (p: Page, compressionLevel = 6) => sharp(p.data, { raw: { width: p.w, height: p.h, channels: 4 } }).png({ compressionLevel }).toBuffer();

let n = 0;
/** Снимок во временном каталоге: ключ → страницы (или ошибка сборки). */
async function snapshot(keys: Record<string, Page[] | { error: string }>) {
  const dir = path.join(root, `s${n++}`);
  const manifest: Manifest = {};
  for (const [key, pages] of Object.entries(keys)) {
    if (!Array.isArray(pages)) {
      manifest[key] = { pages: 0, sha256: [], ...pages };
      continue;
    }
    await mkdir(keyDir(dir, key), { recursive: true });
    const files = await Promise.all(pages.map(async (p, i) => (await writeFile(pagePath(keyDir(dir, key), i), await png(p)), pagePath(keyDir(dir, key), i))));
    manifest[key] = await entryFor(files);
  }
  await writeManifest(dir, manifest);
  return dir;
}

const cream: [number, number, number] = [250, 247, 242];
const wine: [number, number, number] = [122, 31, 43];

describe("визуальная сверка снимков", () => {
  it("хеш страницы — по пикселям, а не по байтам PNG", async () => {
    const a = path.join(root, "fast.png");
    const b = path.join(root, "small.png");
    await writeFile(a, await png(page(wine), 0));
    await writeFile(b, await png(page(wine), 9));
    expect(pixelHash(await readPixels(a))).toBe(pixelHash(await readPixels(b)));
  });

  it("одинаковые снимки — отличий нет, диффов нет", async () => {
    const keys = { "pdf:block:x": [page(cream), page(wine)], "html:toc:x": [page(wine)] };
    const ref = await snapshot(keys);
    const cur = await snapshot(keys);
    expect(await compareSnapshots(ref, cur)).toEqual({ keys: 2, pages: 3, differences: [] });
    expect(existsSync(path.join(cur, "diff"))).toBe(false);
  });

  it("один пиксель — отличие; в диффе он красный, остальное — бледная текущая страница", async () => {
    const ref = await snapshot({ "pdf:block:x": [page(cream), page(wine)] });
    const cur = await snapshot({ "pdf:block:x": [page(cream), page(wine, [[2, 1]])] });
    const { differences } = await compareSnapshots(ref, cur);
    expect(differences).toEqual([{ key: "pdf:block:x", text: "стр. 2: 1 пикс.", diffs: [path.join(cur, "diff/pdf/block/x/002.png")] }]);
    const diff = await readPixels(differences[0].diffs[0]);
    const at = (x: number, y: number) => [...diff.data.subarray((y * W + x) * 4, (y * W + x) * 4 + 4)];
    expect(at(2, 1)).toEqual([255, 0, 0, 255]);
    // 255 − (255 − 122) × 0,25 = 221,75 → 222 и т. д.
    expect(at(0, 0)).toEqual([222, 199, 202, 255]);
  });

  it("отличия по ключам, числу страниц, размеру и ошибкам сборки", async () => {
    const ref = await snapshot({
      "pdf:block:a": [page(cream), page(cream)],
      "pdf:block:b": [page(cream)],
      "pdf:cover:a": [page(cream)],
      "html:preview:a": { error: "unsupported number: Infinity" },
      "html:front:a": { error: "unsupported number: Infinity" },
    });
    const cur = await snapshot({
      "pdf:block:a": [page(cream), page(cream), page(cream)],
      "pdf:block:c": [page(cream)],
      "pdf:cover:a": [page(cream, [], { w: W + 1, h: H })],
      "html:preview:a": [page(cream)],
      "html:front:a": { error: "unsupported number: Infinity" },
    });
    const report = await compareSnapshots(ref, cur);
    expect(report.differences.map(({ key, text }) => [key, text])).toEqual([
      ["html:preview:a", "ошибка сборки: unsupported number: Infinity → нет"],
      ["pdf:block:a", "страниц 2 → 3"],
      ["pdf:block:b", "нет в текущем снимке"],
      ["pdf:block:c", "нет в эталоне"],
      // Лишний столбец — отличающиеся пиксели: H штук.
      ["pdf:cover:a", `стр. 1: ${H} пикс., размер ${W}×${H} → ${W + 1}×${H}`],
    ]);
  });

  it("CLI: код выхода 0 без отличий и 1 при отличии", async () => {
    const ref = await snapshot({ "pdf:block:x": [page(cream)] });
    const same = await snapshot({ "pdf:block:x": [page(cream)] });
    const other = await snapshot({ "pdf:block:x": [page(wine)] });
    const cli = (cur: string) => spawnSync(process.execPath, ["--import", "tsx", "scripts/visual/compare.ts", ref, cur], { cwd: ROOT, encoding: "utf8" });
    const ok = cli(same);
    expect([ok.status, ok.stdout.trim()]).toEqual([0, "Отличий нет: ключей 1, страниц 1"]);
    const bad = cli(other);
    expect(bad.status).toBe(1);
    expect(bad.stdout).toContain(`✗ pdf:block:x — стр. 1: ${W * H} пикс.`);
  });
});
