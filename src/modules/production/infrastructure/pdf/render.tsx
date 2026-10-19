import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { PDFDocument, rgb } from "pdf-lib";
import sharp from "sharp";
import type { Book, BookChapter, BookLetter, BookQuestion, Photo } from "@/shared/infrastructure/db/schema";
import { messagesFor } from "@/i18n/messages";
import { coverPhotoIds, getCoverTemplate, renderCoverSvg } from "@/lib/book/covers";
import { coverNames } from "@/lib/book/cover-names";
import { coverPhotoDataUrl } from "../coverPhotos";
import {
  coverFrontGeometry,
  coverSpreadGeometry,
  coverSpreadZones,
  getFormat,
  mm,
  print,
  printablePageCount,
  spineWidthMm,
  type CoverGeometry,
} from "@/lib/book/formats";
import { photoAreaMm, photoPages, toPhotoItem, type BookContent, type PhotoItem } from "@/lib/book/layout";
import { buildBookContent } from "@/lib/book/book-content";
import { emptyFlow } from "@/lib/book/flow-decisions";
import { interiorMetrics, textArea } from "@/lib/book/page-geometry";
import { interiorSizes } from "@/lib/book/typesetting";
import { openerPhotoPlan, photoArea, photoPagePlan, type PhotoCell } from "@/lib/book/photo-pages";
import { cropRect, inlineBox, normalizeStyle } from "@/lib/book/inline-photo";
import { getFile } from "@/shared/infrastructure/storage";
import { bakeFrame } from "./frame";
import { frameKey, parseFrames } from "@/lib/book/photo-frame";
import type { PhotoSpec } from "@/lib/book/covers/svg-kit";
import { backArtSvg, backContent, backPhotoIds, designBack, type BackDesign } from "@/lib/book/cover-back";
import { CoverDocument } from "@/modules/production/infrastructure/pdf/cover";
import { ensureFonts, renderPdf } from "@/modules/production/infrastructure/pdf/fonts";
import { InteriorDocument, type PreparedImage } from "@/modules/production/infrastructure/pdf/interior";
import { refineFlow } from "@/modules/production/infrastructure/pdf/flow";

export type RenderMode = "print" | "preview" | "reading";

/** Книга со всем содержимым — бандл из read-модели Authoring (`authoring.queries.bundle`). */
export interface BookBundle {
  book: Book;
  questions: BookQuestion[];
  /** Главы своей книги по порядку (у книг с банком — пусто): без них своя книга напечаталась бы «без названия». */
  chapters: BookChapter[];
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
    ...content.chapters.flatMap((c) => [...(c.openerPhoto ? [c.openerPhoto] : []), ...c.photos, ...c.items.flatMap((it) => it.photos ?? [])]),
    ...content.galleryPhotos,
  ];
  const pxPerMm = dpi / 25.4;
  const result = new Map<string, PreparedImage>();
  const openerIds = new Set(content.chapters.flatMap((c) => (c.openerPhoto ? [c.openerPhoto.id] : [])));
  const openerShot = openerPhotoPlan(content.format, content.interior);
  // Места на фотостраницах — по той же раскладке, что и в вёрстке: снимок готовим ровно под своё место.
  const area = photoArea(content.format);
  const sizes = interiorSizes(content.interior, interiorMetrics[content.format.id].scale);
  const cells = new Map<string, PhotoCell>();
  for (const list of [...content.chapters.map((c) => c.photos), content.galleryPhotos])
    for (const group of photoPages(list))
      if (!(group.length === 1 && group[0].layout === "bleed")) for (const c of photoPagePlan(group, area, content.interior, sizes).cells) cells.set(c.id, c);
  await Promise.all(
    all.map(async (p) => {
      const input = await getFile(source === "full" ? p.storageKey : p.thumbKey);
      let img = sharp(input);
      const cell = cells.get(p.id);
      if (openerShot && openerIds.has(p.id)) {
        // Снимок начальной полосы: кадр по месту с учётом содержимого.
        const w = Math.round(openerShot.img.w * pxPerMm);
        const h = Math.round(openerShot.img.h * pxPerMm);
        img = img.resize(w, h, { fit: "cover", position: sharp.strategy.attention });
        // «Во всю полосу»: затемнение снизу под светлое название — прямо в снимке (как градиент в превью).
        const sh = openerShot.shade;
        if (sh) {
          const grad = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="${sh.from}" stop-color="${sh.color}" stop-opacity="0"/><stop offset="1" stop-color="${sh.color}" stop-opacity="${sh.opacity}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
          img = sharp(await img.toBuffer()).composite([{ input: Buffer.from(grad) }]);
        }
      } else if (p.layout === "bleed" && !inlineIds.has(p.id)) {
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
        img = sharp(input).extract(cropRect(src, style)).resize(Math.round(box.w * pxPerMm), Math.round(box.h * pxPerMm), { fit: "fill", withoutEnlargement: true });
      } else if (cell) {
        // Сетка — кадр по месту с учётом содержимого снимка; целиком — те же пропорции, просто нужный размер.
        img = img.resize(Math.max(1, Math.round(cell.img.w * pxPerMm)), Math.max(1, Math.round(cell.img.h * pxPerMm)), { fit: "cover", position: cell.fit === "cover" ? sharp.strategy.attention : "centre" });
      } else {
        const a = photoAreaMm(content.format, "full");
        img = img.resize(Math.round(a.w * pxPerMm), Math.round(a.h * pxPerMm), { fit: "inside", withoutEnlargement: true });
      }
      const { data, info } = await img.jpeg({ quality: mode === "preview" ? 75 : 90 }).toBuffer({ resolveWithObject: true });
      result.set(p.id, { data, width: info.width, height: info.height });
    }),
  );
  return result;
}

export function contentFor(bundle: BookBundle): BookContent {
  return buildBookContent(bundle.book, bundle.questions, bundle.photos.map(toPhotoItem), bundle.chapters, undefined, bundle.letters ?? []);
}

/**
 * Версия правил вёрстки блока: поменяли набор — меняем, и кэш предпросмотров пересобирается.
 * 5 — виды книг: главы своей книги из book_chapters, подписи галереи и «записано со слов» по виду, свой текст не склоняется.
 * Начальная полоса с названием и эпиграфом длиннее глав банков (opener-fit) и строка на обороте титула появляются только у
 * книг этих видов — содержимое и отпечаток подарков прежние, поэтому версия остаётся 5 (не вышедшей до этих правок).
 */
const LAYOUT_VERSION = 5;

/** Отпечаток содержимого: меняется вместе с текстом, фото и их раскладкой — ключ кэша предпросмотра. */
export function contentFingerprint(bundle: BookBundle): string {
  return createHash("sha1")
    .update(`v${LAYOUT_VERSION}`)
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
  if (c.recordedBy) lines.push(t.recordedBy(c.recordedBy));
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
  /** Первая полоса каждой главы (по ключу главы; галерея — "__gallery") — те же номера, что в оглавлении. */
  chapterPages: Record<string, number>;
}

/** Сколько раз собираем блок, доводя вёрстку (обычно хватает 2–4). */
const MAX_FLOW_PASSES = 12;

let placeholderJpeg: Promise<Buffer> | undefined;
/** Крошечный снимок-заглушка: на раскладку влияют только заданные размеры фото, а не сами пиксели. */
const placeholder = () => (placeholderJpeg ??= sharp({ create: { width: 4, height: 4, channels: 3, background: "#cccccc" } }).jpeg().toBuffer());

export async function renderInterior(bundle: BookBundle, mode: RenderMode, opts: { watermark?: boolean } = {}): Promise<InteriorResult> {
  ensureFonts();
  const content = contentFor(bundle);
  const { bleed } = modeSettings[mode];
  const watermark = opts.watermark ?? modeSettings[mode].watermark;
  const images = await prepareImages(content, mode, bleed);

  // Доводка вёрстки: собираем блок с заглушками вместо фото, читаем раскладку, принимаем решения
  // (разрывы перед заголовками, размер фото под свободное место — см. lib/book/flow-decisions.ts) и повторяем, пока есть что поправить.
  // Заодно узнаём номера страниц глав для оглавления.
  const stub = await placeholder();
  const draftImages = new Map([...images].map(([id, img]) => [id, { ...img, data: stub }]));
  const chapterOf = new Map(content.chapters.flatMap((c) => c.items.map((it) => [it.id, c.key] as const)));
  const flow = emptyFlow();
  const typo = content.interior.type;
  const minLead = interiorSizes(content.interior, interiorMetrics[content.format.id].scale).body * typo.lineHeight * 2.6;
  let tocPages: Record<string, number> | undefined;
  for (let pass = 0; pass < MAX_FLOW_PASSES; pass++) {
    let layout: unknown;
    const captured: Record<string, number> = {};
    const rowHeights = new Map<string, number>();
    await renderPdf(
      <InteriorDocument
        content={content}
        options={{ bleedMm: bleed, watermark, images: draftImages, flow, rowHeights, tocPages, onLayout: (l) => (layout = l), onChapterPage: (k, p) => (captured[k] = p) }}
      />,
    );
    tocPages = captured;
    if (!layout || !refineFlow(layout, flow, rowHeights, chapterOf, minLead)) break;
  }
  const raw = await renderPdf(<InteriorDocument content={content} options={{ bleedMm: bleed, watermark, images, tocPages, flow }} />);

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
  return { pdf, pageCount, contentPages, chapterPages: tocPages ?? {} };
}

/** Фото для рисунка обложки: data-URL, ужатый до разумного размера (librsvg держит его в памяти целиком). */
async function coverPhotoHref(p: Photo, source: "full" | "thumb") {
  const buf = await getFile(source === "full" ? p.storageKey : p.thumbKey);
  const data = source === "full" ? await sharp(buf).resize(3200, 3200, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer() : buf;
  return `data:image/jpeg;base64,${data.toString("base64")}`;
}

async function coverBackground(bundle: BookBundle, geometry: CoverGeometry, dpi: number, source: "full" | "thumb", back: { design: BackDesign; photos: Photo[] }) {
  const template = getCoverTemplate(bundle.book.coverTemplate);
  const frames = parseFrames(bundle.book.photoFrames);
  const photos = await Promise.all(
    coverPhotoIds(bundle.book).map(async (id, i): Promise<PhotoSpec | undefined> => {
      const p = id ? bundle.photos.find((x) => x.id === id) : undefined;
      return p ? { href: await coverPhotoHref(p, source), width: p.width, height: p.height, frame: frames[frameKey("cover", i)] } : undefined;
    }),
  );
  // Обложка на снимке: для печати — оригинал, для превью — уменьшенная копия.
  const imageHref = template.photo ? await coverPhotoDataUrl(template.photo.photo.key, source === "full" ? undefined : 2400) : undefined;
  let svg = renderCoverSvg(template, geometry, { uid: "c", photos, imageHref }, { pxPerMm: dpi / 25.4, noTexture: true, plainBack: back.design.plainArt });
  // Фото оборота «во всю», затемнение и тени под карточками — частью рисунка развёртки.
  if (geometry.back) {
    const bleed = new Set(back.design.blocks.flatMap((b) => (b.kind === "photo" && b.frame === "bleed" ? [b.slot] : [])));
    const hrefs = await Promise.all(back.photos.map(async (p, i): Promise<PhotoSpec | undefined> => (bleed.has(i) ? { href: await coverPhotoHref(p, source), width: p.width, height: p.height, frame: frames[frameKey("back", i)] } : undefined)));
    svg = svg.replace(/<\/svg>$/, `${backArtSvg(back.design, geometry.back, hrefs, "cb")}</svg>`);
  }
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

/** Задняя сторона: раскладка и снимки, которые на ней стоят (по порядку мест). Фото «во всю» рисуется в фоне. */
async function backSide(bundle: BookBundle, geometry: CoverGeometry, source: "full" | "thumb") {
  const template = getCoverTemplate(bundle.book.coverTemplate);
  const list = backPhotoIds(bundle.book).flatMap((id) => bundle.photos.filter((x) => x.id === id));
  const b = geometry.back ?? { w: geometry.front.w, h: geometry.front.h };
  const design = designBack(template, b.w, b.h, backContent(bundle.book, list.map((p) => ({ width: p.width, height: p.height })), new Date()));
  const cards = new Set(design.blocks.flatMap((x) => (x.kind === "photo" && x.frame !== "bleed" ? [x.slot] : [])));
  const frames = parseFrames(bundle.book.photoFrames);
  // Карточки рисует react-pdf (он не умеет увеличивать и сдвигать снимок): кадр вырезаем в сам файл по пропорциям карточки.
  const area = new Map(design.blocks.flatMap((x) => (x.kind === "photo" && x.frame !== "bleed" ? [[x.slot, { w: x.w - x.mat * 2, h: x.h - x.mat - (x.frame === "polaroid" ? (x.matBottom ?? x.mat) : x.mat) }] as const] : [])));
  const buffers = await Promise.all(
    list.map(async (p, i) => {
      if (!cards.has(i)) return null;
      const file = await getFile(source === "full" ? p.storageKey : p.thumbKey);
      const a = area.get(i);
      return a && a.h > 0 ? bakeFrame(file, a.w / a.h, frames[frameKey("back", i)]) : file;
    }),
  );
  return { design, photos: list, buffers };
}

export function coverText(book: Book) {
  const content = buildBookContent(book, [], [], []);
  return {
    title: content.title,
    subtitle: book.subtitle.trim(),
    names: coverNames(book),
  };
}

export async function renderCover(bundle: BookBundle, pageCount: number, mode: RenderMode, frontOnly = false) {
  ensureFonts();
  const format = getFormat(bundle.book.format);
  const geometry = frontOnly ? coverFrontGeometry(format) : coverSpreadGeometry(format, pageCount);
  const { dpi, source } = modeSettings[mode];
  const back = await backSide(bundle, geometry, source);
  const background = await coverBackground(bundle, geometry, dpi, source, back);
  const template = getCoverTemplate(bundle.book.coverTemplate);
  const text = coverText(bundle.book);
  const pdf = await renderPdf(<CoverDocument template={template} geometry={geometry} background={background} text={text} back={{ design: back.design, photos: back.buffers }} title={text.title} language={bundle.book.language} />);
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

/**
 * Каркас для типографии: готовая обложка из cover.pdf (дизайн тот же, что уйдёт в печать) и поверх неё
 * красные рамки картона — задняя крышка, корешок, передняя крышка. Одна страница, масштаб 1:1.
 */
export async function renderLayoutScheme(bundle: BookBundle, pageCount: number, cover: Buffer) {
  const g = coverSpreadGeometry(getFormat(bundle.book.format), pageCount);
  const out = await PDFDocument.create();
  const [page] = await out.copyPages(await PDFDocument.load(cover), [0]);
  out.addPage(page);
  const height = page.getHeight();
  for (const r of [g.back!, g.spine!, g.front]) {
    // У pdf-lib начало координат внизу слева, в геометрии — вверху слева.
    page.drawRectangle({ x: mm(r.x), y: height - mm(r.y + r.h), width: mm(r.w), height: mm(r.h), borderColor: rgb(0.85, 0.15, 0.17), borderWidth: mm(0.35) });
  }
  out.setTitle(`Каркас обложки — ${coverText(bundle.book).title}`);
  out.setProducer("MyBooks");
  return Buffer.from(await out.save());
}

export interface PrintPackage {
  interior: Buffer;
  cover: Buffer;
  layout: Buffer;
  pageCount: number;
  spineMm: number;
  coverWidthMm: number;
  coverHeightMm: number;
}

export async function renderPrintPackage(bundle: BookBundle): Promise<PrintPackage> {
  const interior = await renderInterior(bundle, "print");
  const cover = await renderCover(bundle, interior.pageCount, "print");
  const layout = await renderLayoutScheme(bundle, interior.pageCount, cover.pdf);
  return {
    interior: interior.pdf,
    cover: cover.pdf,
    layout,
    pageCount: interior.pageCount,
    spineMm: spineWidthMm(interior.pageCount),
    coverWidthMm: Math.round(cover.geometry.width * 10) / 10,
    coverHeightMm: Math.round(cover.geometry.height * 10) / 10,
  };
}

export function printSpecText(bundle: BookBundle, pkg: PrintPackage, orderNumber?: number) {
  const format = getFormat(bundle.book.format);
  const g = coverSpreadGeometry(format, pkg.pageCount);
  const zones = coverSpreadZones(format, pkg.pageCount);
  const r = (v: number) => (Math.round(v * 10) / 10).toString().replace(".", ",");
  return [
    `ТЕХНИЧЕСКОЕ ЗАДАНИЕ НА ПЕЧАТЬ${orderNumber ? ` — ЗАКАЗ №${orderNumber}` : ""}`,
    ``,
    `Издание: «${coverText(bundle.book).title}»`,
    `Каркас: layout.pdf — развёртка обложки с дизайном и красными рамками крышек и корешка, 1:1`,
    `Формат блока (обрезной): ${format.widthMm}×${format.heightMm} мм`,
    `Объём блока: ${pkg.pageCount} полос (${pkg.pageCount / 2} листов), 4+4`,
    `Вылеты блока: ${print.bleedMm} мм с каждой стороны (TrimBox/BleedBox заданы в PDF)`,
    `Переплёт: твёрдый, 7БЦ, шитьё нитками`,
    ``,
    `ОБЛОЖКА (развёртка): ${r(g.width)}×${r(g.height)} мм, 4+0`,
    `  Отступ по периметру (загиб на картон, включает вылет): ${print.cover.wrapMm} мм`,
    `  Картон крышки: ${r(g.front.w)}×${r(g.front.h)} мм (кант ${print.cover.boardOverhangMm} мм)`,
    `  Расставы между сгибами (шарниры): ${print.cover.hingeMm} мм`,
    `  Корешок: ${r(pkg.spineMm)} мм (${pkg.pageCount / 2} л. × ${print.sheetThicknessMm} мм + ${print.cover.spineExtraMm} мм картон и отстав)`,
    `  Порядок слева направо, мм: ${zones.map((z) => r(z.w)).join(" | ")}`,
    `  Координаты сгибов слева направо, мм: ${(g.folds ?? []).map(r).join(" / ")}`,
    ``,
    `Файлы:`,
    `  block.pdf — блок, ${pkg.pageCount} стр., ${format.widthMm + print.bleedMm * 2}×${format.heightMm + print.bleedMm * 2} мм с вылетами`,
    `  cover.pdf — развёртка обложки ${r(g.width)}×${r(g.height)} мм`,
    `  layout.pdf — каркас: обложка с рамками крышек и корешка`,
    `Цвет: RGB (sRGB), изображения ${print.dpi} dpi. Шрифты внедрены.`,
  ].join("\n");
}
