import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFString, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { compareSnapshots } from "../scripts/visual/compare";
import { pdfNotes, pdfSummary, type PdfPage, type PdfSummary } from "../scripts/visual/pdf-digest";
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
/** Снимок во временном каталоге: ключ → страницы (со сводкой PDF или без) или ошибка сборки. */
async function snapshot(keys: Record<string, Page[] | { pages: Page[]; pdf: PdfSummary } | { error: string }>) {
  const dir = path.join(root, `s${n++}`);
  const manifest: Manifest = {};
  for (const [key, value] of Object.entries(keys)) {
    if ("error" in value) {
      manifest[key] = { pages: 0, sha256: [], error: value.error };
      continue;
    }
    const { pages, pdf } = Array.isArray(value) ? { pages: value, pdf: undefined } : value;
    await mkdir(keyDir(dir, key), { recursive: true });
    const files = await Promise.all(pages.map(async (p, i) => (await writeFile(pagePath(keyDir(dir, key), i), await png(p)), pagePath(keyDir(dir, key), i))));
    manifest[key] = { ...(await entryFor(files)), ...(pdf && { pdf }) };
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
    expect(await compareSnapshots(ref, cur)).toEqual({ keys: 2, pages: 3, differences: [], pdfUnchecked: 0 });
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

interface PdfOptions {
  /** Положение колонцифры по горизонтали, pt. */
  x?: number;
  date?: Date;
  producer?: string;
  id?: string;
  /** Producer и CreationDate — ссылками на объекты-строки, как пишет pdfkit (обложка). */
  indirect?: boolean;
}

/** Полоса 200×300 pt с вылетом 9 pt, колонцифрой Helvetica и фото W×H; объекты сжаты в потоки, как у pdf-lib в renderInterior. */
async function makePdf({ x = 100, date = new Date("2026-05-01T09:00:00Z"), producer = "MyBooks", id = "aa", indirect = false }: PdfOptions = {}) {
  const doc = await PDFDocument.create();
  const sheet = doc.addPage([200, 300]);
  sheet.setBleedBox(0, 0, 200, 300);
  sheet.setTrimBox(9, 9, 182, 282);
  sheet.drawText("12", { x, y: 20, size: 9, font: await doc.embedFont(StandardFonts.Helvetica) });
  sheet.drawImage(await doc.embedPng(await png(page(wine))), { x: 20, y: 40, width: 80, height: 60 });
  doc.setCreationDate(date);
  doc.setModificationDate(date);
  doc.setProducer(producer);
  const { context } = doc;
  if (indirect) {
    const info = context.lookup(context.trailerInfo.Info, PDFDict);
    info.set(PDFName.of("Producer"), context.register(PDFString.of(producer)));
    info.set(PDFName.of("CreationDate"), context.register(PDFString.fromDate(date)));
  }
  context.trailerInfo.ID = context.obj([PDFHexString.of(id), PDFHexString.of(id)]);
  return doc.save();
}

const pdfPage = (patch: Partial<PdfPage> = {}): PdfPage => ({ media: [0, 0, 200, 300], trim: [9, 9, 191, 291], bleed: [0, 0, 200, 300], images: [`${W}×${H}`], fonts: ["Helvetica"], ...patch });
const summary = (sha256: string, ...pages: Partial<PdfPage>[]): PdfSummary => ({ sha256, pages: (pages.length ? pages : [{}]).map(pdfPage) });

describe("сводка PDF", () => {
  it("хеш — без времени сборки, Producer и ID; сдвиг колонцифры на 0,05 pt — другой хеш", async () => {
    const base = await pdfSummary(await makePdf());
    const other = { date: new Date("2027-01-02T03:04:05Z"), producer: "react-pdf", id: "bb" };
    expect((await pdfSummary(await makePdf(other))).sha256).toBe(base.sha256);
    const indirect = await pdfSummary(await makePdf({ indirect: true }));
    expect((await pdfSummary(await makePdf({ ...other, indirect: true }))).sha256).toBe(indirect.sha256);
    expect((await pdfSummary(await makePdf({ x: 100.05 }))).sha256).not.toBe(base.sha256);
  });

  it("структура полосы: боксы, фото в пикселях, шрифты без метки подмножества", async () => {
    expect((await pdfSummary(await makePdf())).pages).toEqual([pdfPage()]);
  });

  it("отличия структуры — по полосам, не больше четырёх", () => {
    expect(pdfNotes(summary("a", {}, {}), summary("b", { trim: null }, { images: [] }))).toEqual(["стр. 1: TrimBox 9 9 191 291 → нет", `стр. 2: фото ${W}×${H} → нет`]);
    const six = Array.from({ length: 6 }, () => ({}));
    expect(pdfNotes(summary("a", ...six), summary("b", ...six.map(() => ({ fonts: ["Lora-Regular"] }))))).toEqual([
      ...[1, 2, 3, 4].map((i) => `стр. ${i}: шрифты Helvetica → Lora-Regular`),
      "и ещё 2",
    ]);
  });

  it("PDF изменился при том же растре — отдельное отличие; без сводки в эталоне сверяется только растр", async () => {
    const ref = await snapshot({
      "pdf:block:a": { pages: [page(cream)], pdf: summary("a") },
      "pdf:block:b": { pages: [page(cream)], pdf: summary("a") },
      "pdf:block:old": [page(cream)],
      "pdf:cover:a": { pages: [page(cream)], pdf: summary("a") },
      "pdf:cover:b": { pages: [page(cream)], pdf: summary("a") },
    });
    const cur = await snapshot({
      "pdf:block:a": { pages: [page(cream)], pdf: summary("b") },
      "pdf:block:b": { pages: [page(cream)], pdf: summary("b", { trim: [9, 9, 191, 292] }) },
      "pdf:block:old": { pages: [page(cream)], pdf: summary("b") },
      "pdf:cover:a": { pages: [page(cream, [[0, 0]])], pdf: summary("b", { images: ["2×2"] }) },
      "pdf:cover:b": { pages: [page(cream)], pdf: summary("a") },
    });
    const report = await compareSnapshots(ref, cur);
    expect(report.differences.map(({ key, text, pdfOnly }) => [key, text, pdfOnly])).toEqual([
      ["pdf:block:a", "PDF изменился при том же растре", true],
      ["pdf:block:b", "PDF изменился при том же растре: стр. 1: TrimBox 9 9 191 291 → 9 9 191 292", true],
      ["pdf:cover:a", `стр. 1: 1 пикс.; стр. 1: фото ${W}×${H} → 2×2`, undefined],
    ]);
    expect(report.pdfUnchecked).toBe(1);
  });

  it("CLI: PDF при том же растре — код выхода 1 и отдельная строка в итоге", async () => {
    const ref = await snapshot({ "pdf:block:x": { pages: [page(cream)], pdf: summary("a") } });
    const cur = await snapshot({ "pdf:block:x": { pages: [page(cream)], pdf: summary("b") } });
    const res = spawnSync(process.execPath, ["--import", "tsx", "scripts/visual/compare.ts", ref, cur], { cwd: ROOT, encoding: "utf8" });
    expect(res.status).toBe(1);
    expect(res.stdout.trim().split("\n")).toEqual([
      "✗ pdf:block:x — PDF изменился при том же растре",
      "Отличия: ключей с отличиями 1; всего ключей 1, страниц 1",
      "PDF изменился при том же растре: ключей 1",
    ]);
  });
});
