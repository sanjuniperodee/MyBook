import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { renderToBuffer } from "@react-pdf/renderer";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import type { Book, BookLetter, BookQuestion, Photo } from "../db/schema";
import { messagesFor } from "@/i18n/messages";
import { coverNamesLine, getCoverTemplate, renderCoverSvg } from "../book/covers";
import {
  coverFrontGeometry,
  coverSpreadGeometry,
  getFormat,
  mm,
  print,
  printablePageCount,
  spineWidthMm,
  type CoverGeometry,
} from "../book/formats";
import { buildBookContent, photoAreaMm, photoPages, textArea, toPhotoItem, type BookContent, type PhotoItem } from "../book/layout";
import { cropRect, inlineBox, normalizeStyle } from "../book/inline-photo";
import { getFile } from "../storage";
import { CoverDocument } from "./cover";
import { ensureFonts } from "./fonts";
import { InteriorDocument, type PreparedImage } from "./interior";

export type RenderMode = "print" | "preview" | "reading";

/** Книга со всем содержимым — бандл из read-модели Authoring (`authoring.queries.bundle`). */
export interface BookBundle {
  book: Book;
  questions: BookQuestion[];
  photos: Photo[];
  letters?: BookLetter[];
}

const modeSettings: Record<RenderMode, { dpi: number; bleed: number; source: "full" | "thumb"; watermark: boolean }> = {
  print: { dpi: print.dpi, bleed: print.bleedMm, source: "full", watermark: false },
  preview: { dpi: 110, bleed: print.bleedMm, source: "thumb", watermark: true },
  reading: { dpi: 200, bleed: 0, source: "full", watermark: false },
};

async function prepareImages(content: BookContent, mode: RenderMode, bleedMm: number): Promise<Map<string, PreparedImage>> {
  const { dpi, source } = modeSettings[mode];
  const inlineIds = new Set(content.chapters.flatMap((c) => c.items.flatMap((it) => (it.photos ?? []).map((p) => p.id))));
  const all: PhotoItem[] = [
    ...content.chapters.flatMap((c) => [...c.photos, ...c.items.flatMap((it) => it.photos ?? [])]),
    ...content.galleryPhotos,
  ];
  const pxPerMm = dpi / 25.4;
  const result = new Map<string, PreparedImage>();
  const halves = new Set(
    [...content.chapters.map((c) => c.photos), content.galleryPhotos]
      .flatMap((list) => photoPages(list))
      .filter((g) => g.length > 1)
      .flat()
      .map((p) => p.id),
  );
  await Promise.all(
    all.map(async (p) => {
      const input = await getFile(source === "full" ? p.storageKey : p.thumbKey);
      let img = sharp(input);
      if (p.layout === "bleed") {
        const w = Math.round((content.format.widthMm + bleedMm * 2) * pxPerMm);
        const h = Math.round((content.format.heightMm + bleedMm * 2) * pxPerMm);
        img = img.resize(w, h, { fit: "cover", position: sharp.strategy.attention });
      } else if (inlineIds.has(p.id)) {
        // Кадрируем так же, как в превью (пропорции + точка фокуса), и ужимаем до ширины блока.
        const style = normalizeStyle(p.inline);
        const meta = await sharp(input).metadata();
        const src = { width: meta.width ?? p.width, height: meta.height ?? p.height };
        const text = textArea(content.format);
        const box = inlineBox(src, style, text.w, text.h);
        img = img.extract(cropRect(src, style)).resize(Math.round(box.w * pxPerMm), Math.round(box.h * pxPerMm), { fit: "fill", withoutEnlargement: true });
      } else {
        const area = photoAreaMm(content.format, halves.has(p.id) ? "half" : p.layout === "half" ? "half" : "full");
        img = img.resize(Math.round(area.w * pxPerMm), Math.round(area.h * pxPerMm), { fit: "inside", withoutEnlargement: true });
      }
      const { data, info } = await img.jpeg({ quality: mode === "preview" ? 75 : 90 }).toBuffer({ resolveWithObject: true });
      result.set(p.id, { data, width: info.width, height: info.height });
    }),
  );
  return result;
}

export function contentFor(bundle: BookBundle): BookContent {
  return buildBookContent(bundle.book, bundle.questions, bundle.photos.map(toPhotoItem), undefined, bundle.letters ?? []);
}

/** Отпечаток содержимого: меняется вместе с текстом, фото и их раскладкой — ключ кэша предпросмотра. */
export function contentFingerprint(bundle: BookBundle): string {
  return createHash("sha1")
    .update(JSON.stringify(contentFor(bundle)))
    .update(bundle.photos.map((p) => `${p.id}:${p.layout}:${p.caption}`).join("|"))
    .digest("hex")
    .slice(0, 16);
}

/** Текст книги одним файлом — резервная копия для клиента. */
export function plainText(bundle: BookBundle): { title: string; text: string } {
  const c = contentFor(bundle);
  const t = messagesFor(c.language).book;
  const lines: string[] = [c.title.toUpperCase()];
  if (c.subtitle) lines.push(c.subtitle);
  if (c.authorName) lines.push(c.authorName);
  if (c.dedication) lines.push("", c.dedication);
  for (const ch of c.chapters) {
    lines.push("", "", `${t.chapter(ch.number).toUpperCase()}. ${ch.title.toUpperCase()}`);
    for (const it of ch.items) {
      lines.push("");
      if (it.heading) lines.push(it.heading, "");
      lines.push(it.answer);
    }
  }
  return { title: c.title, text: lines.join("\r\n") + "\r\n" };
}

export interface InteriorResult {
  pdf: Buffer;
  pageCount: number;
  contentPages: number;
}

export async function renderInterior(bundle: BookBundle, mode: RenderMode): Promise<InteriorResult> {
  ensureFonts();
  const content = contentFor(bundle);
  const { bleed, watermark } = modeSettings[mode];
  const images = await prepareImages(content, mode, bleed);

  let tocPages: Record<string, number> | undefined;
  if (content.showToc && content.chapters.length) {
    const captured: Record<string, number> = {};
    await renderToBuffer(
      <InteriorDocument content={content} options={{ bleedMm: bleed, watermark, images, onChapterPage: (k, p) => (captured[k] = p) }} />,
    );
    tocPages = captured;
  }
  const raw = await renderToBuffer(<InteriorDocument content={content} options={{ bleedMm: bleed, watermark, images, tocPages }} />);

  const doc = await PDFDocument.load(raw);
  const contentPages = doc.getPageCount();
  const width = mm(content.format.widthMm + bleed * 2);
  const height = mm(content.format.heightMm + bleed * 2);
  let pageCount = contentPages;
  if (mode !== "reading") {
    pageCount = printablePageCount(contentPages);
    for (let i = contentPages; i < pageCount; i++) doc.addPage([width, height]);
    for (const page of doc.getPages()) {
      page.setBleedBox(0, 0, width, height);
      page.setTrimBox(mm(bleed), mm(bleed), mm(content.format.widthMm), mm(content.format.heightMm));
    }
  }
  doc.setTitle(content.title);
  doc.setAuthor(content.authorName);
  doc.setProducer("MyBooks");
  const pdf = Buffer.from(await doc.save());
  return { pdf, pageCount, contentPages };
}

async function coverBackground(bundle: BookBundle, geometry: CoverGeometry, dpi: number, source: "full" | "thumb") {
  const template = getCoverTemplate(bundle.book.coverTemplate);
  let photoHref: string | undefined;
  if (template.requiresPhoto && bundle.book.coverPhotoId) {
    const p = bundle.photos.find((x) => x.id === bundle.book.coverPhotoId);
    if (p) {
      const buf = await getFile(source === "full" ? p.storageKey : p.thumbKey);
      photoHref = `data:image/jpeg;base64,${buf.toString("base64")}`;
    }
  }
  const svg = renderCoverSvg(template, geometry, { uid: "c", photoHref }, { pxPerMm: dpi / 25.4, noTexture: true });
  const base = await sharp(Buffer.from(svg), { limitInputPixels: false, density: 72 }).flatten({ background: "#ffffff" }).png({ compressionLevel: 1 }).toBuffer({ resolveWithObject: true });
  let img = sharp(base.data, { limitInputPixels: false });
  if (template.texture) {
    const tex = await textureLayer(template.texture.kind, template.texture.opacity, base.info.width, base.info.height, dpi / 25.4);
    img = img.composite([{ input: tex, blend: "multiply" }]);
  }
  return img.jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
}

function noise(width: number, height: number) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  return { buf: randomBytes(w * h), w, h };
}

/**
 * Слой фактуры для режима multiply: 255 — без изменений, темнее — затемнение.
 * Аналог SVG-фильтров grain/linen из шаблонов, но в десятки раз быстрее на 300 dpi.
 */
async function textureLayer(kind: "grain" | "linen", opacity: number, width: number, height: number, pxPerMm: number) {
  const strength = opacity * 0.85;
  const up = (n: { buf: Buffer; w: number; h: number }) =>
    sharp(n.buf, { raw: { width: n.w, height: n.h, channels: 1 }, limitInputPixels: false }).resize(width, height, { fit: "fill", kernel: "cubic" });
  let layer: Buffer;
  if (kind === "grain") {
    const cell = Math.max(1, pxPerMm / 3);
    layer = await up(noise(width / cell, height / cell)).raw().toBuffer();
  } else {
    const fine = Math.max(1, pxPerMm / 2);
    const coarse = pxPerMm * 12;
    const vertical = await up(noise(width / fine, height / coarse)).raw().toBuffer();
    const horizontal = await up(noise(width / coarse, height / fine)).raw().toBuffer();
    layer = Buffer.alloc(vertical.length);
    for (let i = 0; i < layer.length; i++) layer[i] = (vertical[i] * horizontal[i]) >> 8;
  }
  return sharp(layer, { raw: { width, height, channels: 1 }, limitInputPixels: false })
    .linear(-strength, 255)
    .toColourspace("srgb")
    .png({ compressionLevel: 1 })
    .toBuffer();
}

export function coverText(book: Book) {
  const content = buildBookContent(book, [], []);
  return {
    title: content.title,
    subtitle: book.subtitle.trim(),
    names: coverNamesLine(book.authorName, book.recipientName, book.hideRecipientOnCover),
  };
}

export async function renderCover(bundle: BookBundle, pageCount: number, mode: RenderMode, frontOnly = false) {
  ensureFonts();
  const format = getFormat(bundle.book.format);
  const geometry = frontOnly ? coverFrontGeometry(format) : coverSpreadGeometry(format, pageCount);
  const { dpi, source } = modeSettings[mode];
  const background = await coverBackground(bundle, geometry, dpi, source);
  const template = getCoverTemplate(bundle.book.coverTemplate);
  const text = coverText(bundle.book);
  const pdf = await renderToBuffer(
    <CoverDocument template={template} geometry={geometry} background={background} text={text} backText={bundle.book.backText} title={text.title} language={bundle.book.language} />,
  );
  return { pdf: Buffer.from(pdf), geometry };
}

/** Читательская версия: обложка + блок без вылетов, одним файлом. */
export async function renderReadingPdf(bundle: BookBundle) {
  const [interior, cover] = await Promise.all([renderInterior(bundle, "reading"), renderCover(bundle, 0, "reading", true)]);
  const out = await PDFDocument.create();
  const [coverDoc, interiorDoc] = await Promise.all([PDFDocument.load(cover.pdf), PDFDocument.load(interior.pdf)]);
  const [coverPage] = await out.copyPages(coverDoc, [0]);
  out.addPage(coverPage);
  for (const p of await out.copyPages(interiorDoc, interiorDoc.getPageIndices())) out.addPage(p);
  out.setTitle(coverText(bundle.book).title);
  out.setProducer("MyBooks");
  return Buffer.from(await out.save());
}

export interface PrintPackage {
  interior: Buffer;
  cover: Buffer;
  pageCount: number;
  spineMm: number;
  coverWidthMm: number;
  coverHeightMm: number;
}

export async function renderPrintPackage(bundle: BookBundle): Promise<PrintPackage> {
  const interior = await renderInterior(bundle, "print");
  const cover = await renderCover(bundle, interior.pageCount, "print");
  return {
    interior: interior.pdf,
    cover: cover.pdf,
    pageCount: interior.pageCount,
    spineMm: spineWidthMm(interior.pageCount),
    coverWidthMm: Math.round(cover.geometry.width * 10) / 10,
    coverHeightMm: Math.round(cover.geometry.height * 10) / 10,
  };
}

export function printSpecText(bundle: BookBundle, pkg: PrintPackage, orderNumber?: number) {
  const format = getFormat(bundle.book.format);
  const g = coverSpreadGeometry(format, pkg.pageCount);
  const r = (v: number) => (Math.round(v * 10) / 10).toString().replace(".", ",");
  return [
    `ТЕХНИЧЕСКОЕ ЗАДАНИЕ НА ПЕЧАТЬ${orderNumber ? ` — ЗАКАЗ №${orderNumber}` : ""}`,
    ``,
    `Издание: «${coverText(bundle.book).title}»`,
    `Формат блока (обрезной): ${format.widthMm}×${format.heightMm} мм`,
    `Объём блока: ${pkg.pageCount} полос (${pkg.pageCount / 2} листов), 4+4`,
    `Вылеты блока: ${print.bleedMm} мм с каждой стороны (TrimBox/BleedBox заданы в PDF)`,
    `Переплёт: твёрдый, 7БЦ, шитьё нитками`,
    ``,
    `ОБЛОЖКА (развёртка): ${r(g.width)}×${r(g.height)} мм, 4+0`,
    `  Загиб на картон: ${print.cover.wrapMm} мм`,
    `  Крышка: ${r(g.front.w)}×${r(g.front.h)} мм (кант ${print.cover.boardOverhangMm} мм)`,
    `  Шарнир: ${print.cover.hingeMm} мм`,
    `  Корешок: ${r(pkg.spineMm)} мм (лист ${print.sheetThicknessMm} мм + ${print.cover.spineExtraMm} мм)`,
    `  Координаты сгибов слева направо, мм: ${(g.folds ?? []).map(r).join(" / ")}`,
    ``,
    `Файлы:`,
    `  block.pdf — блок, ${pkg.pageCount} стр., ${format.widthMm + print.bleedMm * 2}×${format.heightMm + print.bleedMm * 2} мм с вылетами`,
    `  cover.pdf — развёртка обложки ${r(g.width)}×${r(g.height)} мм`,
    `Цвет: RGB (sRGB), изображения ${print.dpi} dpi. Шрифты внедрены.`,
  ].join("\n");
}
