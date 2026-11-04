import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/covers/[file]/route";
import { CoverBackPreview, PREVIEW_PAGES } from "@/components/cover/CoverBackPreview";
import { backContent } from "@/lib/book/cover-back";
import { allCoverTemplates, getCoverTemplate } from "@/lib/book/covers";
import {
  backFill,
  backLayersFromLayout,
  inkOn,
  mirrorAngle,
  parseCoverBack,
  parseCoverDesign,
  repeatedFrontLayers,
  spineFill,
  templateForCover,
  type CoverBack,
  type CoverDesign,
} from "@/lib/book/cover-design";
import { designBack } from "@/lib/book/cover-back";
import { coverSpreadGeometry, getFormat, type Rect } from "@/lib/book/formats";
import { backSide, coverBackground, renderCover } from "@/modules/production/infrastructure/pdf/render";
import type { Book } from "@/shared/infrastructure/db/schema";
import { hasTool, textRows } from "./pdf-inspect";

// 03.11.2026: у Анжелы (обложка из конструктора на шаблоне «Фото», фон #1F1A17) превью оборота в кабинете рисовало
// оборот шаблона (#1E1E1E), а PDF — фон конструктора: в печати оборот вышел коричневым. У Айтқали лицо было розовым
// градиентом, а оборот и корешок брали только его первый цвет — тёмно-фиолетовый. Здесь: фон оборота в превью и в
// печати один у всех шаблонов, «как спереди» продолжает лицо, свой фон оборота и его слои печатаются.

const now = new Date();
const book = (over: Partial<Book> = {}): Book => ({
  id: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  theme: "love",
  status: "draft",
  title: "Наша история",
  subtitle: "",
  authorName: "Анжела",
  authorGender: "f",
  recordedBy: "",
  recipientName: "Василий",
  recipientGender: "m",
  hideRecipientOnCover: false,
  namesOnCover: "",
  coverTemplate: "photo",
  coverPhotoId: null,
  coverPhotoExtra: [],
  backText: "",
  backLayout: "quote",
  backPhotoId: null,
  backPhotoExtra: [],
  photoFrames: {},
  dedication: "",
  interior: "classic",
  interiorStyle: {},
  coverDesign: null,
  coverBack: null,
  format: "a5",
  photoPlacement: "chapters",
  showToc: true,
  tocMode: "chapters",
  tocLines: {},
  layoutRev: 2,
  paginationRev: 1,
  inviteToken: null,
  inviteText: "",
  occasion: null,
  occasionDate: null,
  language: "ru",
  createdAt: now,
  updatedAt: now,
  ...over,
});

const g = coverSpreadGeometry(getFormat("a5"), PREVIEW_PAGES);
const backRect = g.back!;
type RGB = [number, number, number];
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const rgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;

async function mean(img: Buffer, crop?: { left: number; top: number; width: number; height: number }): Promise<RGB> {
  let s = sharp(img, { limitInputPixels: false }).flatten({ background: "#ffffff" });
  if (crop) s = s.extract(crop);
  const stats = await sharp(await s.png().toBuffer()).stats();
  return stats.channels.slice(0, 3).map((c) => c.mean) as RGB;
}

/** Фон развёртки, как его растрирует PDF (тот же код, что у renderCover), — средний цвет куска r. */
async function printed(b: Book, r: Rect = backRect): Promise<RGB> {
  const design = parseCoverDesign(b.coverDesign);
  const back = parseCoverBack(b.coverBack);
  const bundle = { book: b, questions: [], chapters: [], photos: [] };
  const template = templateForCover(getCoverTemplate(b.coverTemplate), design, back);
  const side = await backSide(bundle, g, "thumb", template, !!back?.layers);
  const jpg = await coverBackground(bundle, g, 30, "thumb", side, design, back);
  const k = (await sharp(jpg).metadata()).width! / g.width;
  return mean(jpg, { left: Math.round(r.x * k), top: Math.round(r.y * k), width: Math.round(r.w * k), height: Math.round(r.h * k) });
}

/** Фон оборота в превью кабинета (CoverBackPreview): встроенный SVG или картинка с /api/covers — средний цвет. */
async function previewed(b: Book): Promise<{ color: RGB; inline: boolean }> {
  const html = renderToStaticMarkup(
    createElement(CoverBackPreview, { template: b.coverTemplate, format: b.format, content: backContent(b, [], now), design: parseCoverDesign(b.coverDesign), back: parseCoverBack(b.coverBack) }),
  );
  const img = /<img src="\/api\/covers\/([^"?]+)/.exec(html);
  if (img) {
    const res = await GET(new Request(`http://local/api/covers/${img[1]}`), { params: Promise.resolve({ file: img[1] }) });
    const body = Buffer.from(await res.arrayBuffer());
    return { color: await mean(img[1].endsWith(".svg") ? await sharp(body, { density: 86 }).png().toBuffer() : body), inline: false };
  }
  const svg = /<svg[\s\S]*?<\/svg>/.exec(html)![0];
  return { color: await mean(await sharp(Buffer.from(svg), { density: 86 }).png().toBuffer()), inline: true };
}

const color = (c: string): CoverDesign => parseCoverDesign({ background: { kind: "color", color: c }, layers: [] })!;
const gradient = (from: string, to: string, angle: number): CoverDesign => parseCoverDesign({ background: { kind: "gradient", from, to, angle }, layers: [] })!;
const asRow = (v: unknown) => v as Book["coverDesign"];

describe("цвет оборота: превью = печать", () => {
  it("обложка из конструктора со своим цветом (как у Анжелы): оборот в превью — цвет конструктора, а не оборот шаблона", async () => {
    const b = book({ coverTemplate: "photo", coverDesign: asRow(color("#1F1A17")) });
    const [p, v] = await Promise.all([printed(b), previewed(b)]);
    expect(v.inline).toBe(true);
    expect(dist(v.color, rgb("#1F1A17"))).toBeLessThan(2);
    expect(dist(p, rgb("#1F1A17"))).toBeLessThan(2);
  });

  it("розовый градиент лица (как у Айтқали): оборот — тот же градиент зеркально, корешок без шва", async () => {
    const d = gradient("#2B1B2E", "#D9466E", 0);
    const b = book({ coverTemplate: "letter", coverDesign: asRow(d) });
    const front = await printed(b, g.front);
    const back = await printed(b, backRect);
    // Оборот в среднем того же цвета, что лицо (а не первый цвет градиента).
    expect(dist(front, back)).toBeLessThan(4);
    expect(dist(back, rgb("#2B1B2E"))).toBeGreaterThan(40);
    const v = await previewed(b);
    expect(dist(v.color, back)).toBeLessThan(3);
    expect(mirrorAngle(0)).toBe(180);
    expect(mirrorAngle(90)).toBe(90);
    expect(mirrorAngle(120)).toBe(60);
    // Корешок: у горизонтального градиента — цвет края лица у корешка.
    const spine = await printed(b, { x: g.spine!.x + 1, y: g.spine!.y, w: g.spine!.w - 2, h: g.spine!.h });
    expect(dist(spine, rgb("#2B1B2E"))).toBeLessThan(6);
  });

  it.skipIf(!hasTool("pdftoppm"))("лицо — фото поверх светлого фона (как у Айтқали 04.11): «как спереди» повторяет фото на обороте, без надписей", async () => {
    const d = parseCoverDesign({
      background: { kind: "color", color: "#FBF7F1" },
      layers: [
        { id: "c", kind: "image", stock: "clouds", x: 0, y: 0, w: 1, h: 1, frame: { x: 0.5, y: 1, zoom: 1 } },
        { id: "t", kind: "text", text: "Жүрекке жазылған аманат", x: 0.08, y: 0.26, w: 0.85, h: 0.42, style: { font: "yeseva", size: 0.085, color: "#F3D9A4", align: "center", valign: "middle" } },
      ],
    })!;
    expect(repeatedFrontLayers(d, null).map((l) => l.id)).toEqual(["c"]);
    expect(repeatedFrontLayers(d, { v: 1, background: { kind: "color", color: "#111111" } })).toEqual([]);
    // Превью оборота в кабинете рисует снимок лица.
    const html = renderToStaticMarkup(createElement(CoverBackPreview, { template: "letter", content: backContent(book(), [], now), design: d }));
    expect(html).toContain("clouds");
    expect(html).not.toContain("Жүрекке");
    // PDF: оборот того же тона, что лицо (розовые облака), а не кремовый фон.
    const { pdf, geometry } = await renderCover({ book: book({ coverTemplate: "letter", coverDesign: asRow(d) }), questions: [], chapters: [], photos: [] }, 120, "preview");
    const dir = mkdtempSync(path.join(tmpdir(), "cover-back-"));
    const file = path.join(dir, "cover.pdf");
    writeFileSync(file, pdf);
    spawnSync("pdftoppm", ["-r", "20", "-png", "-singlefile", file, path.join(dir, "page")]);
    const png = readFileSync(path.join(dir, "page.png"));
    const k = (await sharp(png).metadata()).width! / geometry.width;
    const at = (r: Rect) => mean(png, { left: Math.round(r.x * k), top: Math.round(r.y * k), width: Math.round(r.w * k), height: Math.round(r.h * k) });
    const back = await at({ ...geometry.back!, y: geometry.back!.y + geometry.back!.h * 0.75, h: geometry.back!.h * 0.2 });
    const front = await at({ ...geometry.front, y: geometry.front.y + geometry.front.h * 0.75, h: geometry.front.h * 0.2 });
    expect(dist(back, front)).toBeLessThan(6);
    expect(dist(back, rgb("#FBF7F1"))).toBeGreaterThan(20);
  });

  it("свой цвет оборота: оборот и корешок в этот цвет, надписи — контрастные", async () => {
    const back: CoverBack = { v: 1, background: { kind: "color", color: "#E78496" } };
    for (const [tpl, design] of [
      ["clouds", null],
      ["linen", color("#1F1A17")],
    ] as const) {
      const b = book({ coverTemplate: tpl, coverDesign: asRow(design), coverBack: asRow(back) });
      expect(dist(await printed(b), rgb("#E78496"))).toBeLessThan(2);
      expect(dist(await printed(b, { x: g.spine!.x + 1, y: g.spine!.y, w: g.spine!.w - 2, h: g.spine!.h }), rgb("#E78496"))).toBeLessThan(2);
      expect(dist((await previewed(b)).color, rgb("#E78496"))).toBeLessThan(2);
      const t = templateForCover(getCoverTemplate(tpl), design, back);
      expect(t.back.color).toBe(inkOn("#E78496"));
      expect(t.spine.color).toBe(inkOn("#E78496"));
      expect(t.back.mirror).toBe(false);
    }
    expect(backFill(null, back)).toEqual({ bg: back.background, mirror: false });
    expect(spineFill(color("#111111"), back)).toEqual(back.background);
    expect(spineFill(color("#111111"), null)).toEqual({ kind: "color", color: "#111111" });
  });

  it("у всех шаблонов фон оборота в превью и в PDF одного цвета (с фактурой зерна и льна)", async () => {
    const worst: string[] = [];
    for (const t of allCoverTemplates.filter((x) => !x.hidden)) {
      const b = book({ coverTemplate: t.id });
      const [p, v] = await Promise.all([printed(b), previewed(b)]);
      const d = dist(p, v.color);
      if (d > 4.5) worst.push(`${t.id}: ${d.toFixed(1)}`);
    }
    expect(worst).toEqual([]);
  });
});

describe("оборот из слоёв", () => {
  it("разбор: как спереди без слоёв — null; свой фон и слои — как у лица", () => {
    expect(parseCoverBack(null)).toBeNull();
    expect(parseCoverBack({ background: { kind: "template" } })).toBeNull();
    expect(parseCoverBack({ background: { kind: "color", color: "#e78496" } })).toEqual({ v: 1, background: { kind: "color", color: "#E78496" } });
    const withLayers = parseCoverBack({ background: { kind: "template" }, layers: [{ id: "t1", kind: "text", text: "Люблю", x: 0.1, y: 0.4, w: 0.8, h: 0.1, style: {} }] });
    expect(withLayers?.layers).toHaveLength(1);
    expect(parseCoverBack({ background: { kind: "template" }, layers: [] })).toEqual({ v: 1, background: { kind: "template" }, layers: [] });
  });

  it("вариант оборота раскладывается слоями на тех же местах: текст, орнамент, фото в карточках, затемнение", () => {
    const template = getCoverTemplate("linen");
    const W = backRect.w;
    const H = backRect.h;
    const content = { ...backContent(book({ backText: "Каждая страница — о тебе." }), [], now), photos: [] };
    const quote = backLayersFromLayout(designBack(template, W, H, content), W, H, { photoIds: [] });
    const text = quote.find((l) => l.kind === "text" && l.text === "Каждая страница — о тебе.");
    expect(text).toBeTruthy();
    for (const l of quote) {
      expect(l.x).toBeGreaterThanOrEqual(-0.07);
      expect(l.x + l.w).toBeLessThanOrEqual(1.07);
    }
    const minimal = backLayersFromLayout(designBack(template, W, H, { ...content, text: "" }), W, H, { photoIds: [], names: content.names });
    expect(minimal.some((l) => l.kind === "text" && l.bind === "names")).toBe(true);
    const photos = [1, 2, 3].map(() => ({ width: 1200, height: 900 }));
    const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
    const pol = backLayersFromLayout(designBack(template, W, H, { ...content, layout: "polaroids", photos }), W, H, { photoIds: ids });
    expect(pol.filter((l) => l.kind === "image").map((l) => (l.kind === "image" ? l.photoId : null))).toEqual(ids);
    const full = backLayersFromLayout(designBack(template, W, H, { ...content, layout: "fullPhoto", photos: photos.slice(0, 1) }), W, H, { photoIds: ids.slice(0, 1) });
    expect(full[0]).toMatchObject({ kind: "image", photoId: ids[0], x: -0.06, w: 1.12 });
    expect(full.filter((l) => l.kind === "shape").length).toBe(12);
  });

  it.skipIf(!hasTool("pdftotext") || !hasTool("pdftoppm"))("PDF: слои оборота печатаются на задней крышке поверх своего фона", async () => {
    const back = { v: 1, background: { kind: "color", color: "#111111" }, layers: [{ id: "q1", kind: "text", text: "Ты — моя история", x: 0.1, y: 0.4, w: 0.8, h: 0.1, style: { font: "cormorant", size: 0.06, color: "#FFFFFF", align: "center", valign: "middle", weight: 400 } }] };
    const b = book({ coverTemplate: "clouds", coverBack: asRow(back), backText: "Эта цитата не печатается" });
    const { pdf, geometry } = await renderCover({ book: b, questions: [], chapters: [], photos: [] }, 120, "preview");
    const dir = mkdtempSync(path.join(tmpdir(), "cover-back-"));
    const file = path.join(dir, "cover.pdf");
    writeFileSync(file, pdf);
    const rows = textRows(file).flat().map((r) => r.text);
    expect(rows.join("\n")).toContain("Ты — моя история");
    expect(rows.join("\n")).not.toContain("Эта цитата");
    // Цвет задней крышки в самом PDF — пиксель у верхнего края оборота.
    spawnSync("pdftoppm", ["-r", "20", "-png", "-singlefile", file, path.join(dir, "page")]);
    const png = readFileSync(path.join(dir, "page.png"));
    const k = (await sharp(png).metadata()).width! / geometry.width;
    const c = await mean(png, { left: Math.round((geometry.back!.x + 10) * k), top: Math.round((geometry.back!.y + 8) * k), width: Math.round(30 * k), height: Math.round(20 * k) });
    expect(dist(c, rgb("#111111"))).toBeLessThan(4);
  });
});
