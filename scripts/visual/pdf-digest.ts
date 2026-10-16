import { createHash } from "node:crypto";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef, PDFStream, type PDFPageLeaf } from "pdf-lib";

/**
 * Сводка PDF для снимка pdf-snapshot (S2): хеш файла без метаданных и структура полос — боксы, размеры фото,
 * шрифты. Ловит то, чего растр 150 dpi может не показать: сдвиг на доли пункта, другой TrimBox, фото другого
 * разрешения, другой шрифт с теми же очертаниями. Сверка — pdfNotes, её вызывает compare.ts.
 */

export interface PdfPage {
  /** MediaBox, TrimBox и BleedBox — числа массива PDF [llx lly urx ury]; null — бокс не задан. */
  media: number[];
  trim: number[] | null;
  bleed: number[] | null;
  /** Image XObject полосы и вложенных Form XObject: «ширина×высота» в пикселях, по возрастанию. */
  images: string[];
  /** Шрифты полосы без метки подмножества (ABCDEF+), по алфавиту. */
  fonts: string[];
}

export interface PdfSummary {
  /** sha256 файла без /CreationDate, /ModDate, /Producer и /ID (см. pdfSha256). */
  sha256: string;
  pages: PdfPage[];
}

/** Метаданные, которые меняются без изменения вида: время сборки и версия библиотеки (ещё /ID в trailer). */
const VOLATILE = ["CreationDate", "ModDate", "Producer"].map((k) => PDFName.of(k));

/**
 * sha256 PDF без метаданных. Словарь Info у pdf-lib лежит в сжатом потоке объектов, поэтому ключи удаляются
 * из разобранного файла (вместе с объектами-строками, на которые они ссылаются), и файл записывается заново
 * без потоков объектов: остальные объекты и содержимое потоков — те же байты.
 */
async function pdfSha256(doc: PDFDocument) {
  const { context } = doc;
  const info = context.lookupMaybe(context.trailerInfo.Info, PDFDict);
  for (const key of VOLATILE) {
    const value = info?.get(key);
    if (value instanceof PDFRef) context.delete(value);
    info?.delete(key);
  }
  context.trailerInfo.ID = undefined;
  const bytes = await doc.save({ useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false });
  return createHash("sha256").update(bytes).digest("hex");
}

const numbers = (arr: PDFArray) => Array.from({ length: arr.size() }, (_, i) => arr.lookup(i, PDFNumber).asNumber());

/** Фото и шрифты из ресурсов полосы и вложенных Form XObject. */
function collect(resources: PDFDict | undefined, out: { images: string[]; fonts: Set<string> }, seen = new Set<PDFDict>()) {
  if (!resources || seen.has(resources)) return;
  seen.add(resources);
  const { context } = resources;
  const fonts = resources.lookupMaybe(PDFName.of("Font"), PDFDict);
  for (const [, ref] of fonts?.entries() ?? []) {
    const base = context.lookupMaybe(ref, PDFDict)?.lookupMaybe(PDFName.of("BaseFont"), PDFName);
    if (base) out.fonts.add(base.decodeText().replace(/^[A-Z]{6}\+/, ""));
  }
  const xobjects = resources.lookupMaybe(PDFName.of("XObject"), PDFDict);
  for (const [, ref] of xobjects?.entries() ?? []) {
    const dict = context.lookupMaybe(ref, PDFStream)?.dict;
    const subtype = dict?.lookupMaybe(PDFName.of("Subtype"), PDFName);
    if (dict && subtype === PDFName.of("Image")) out.images.push(`${dict.lookup(PDFName.of("Width"), PDFNumber).asNumber()}×${dict.lookup(PDFName.of("Height"), PDFNumber).asNumber()}`);
    else if (dict && subtype === PDFName.of("Form")) collect(dict.lookupMaybe(PDFName.of("Resources"), PDFDict), out, seen);
  }
}

function pageSummary(node: PDFPageLeaf): PdfPage {
  const box = (name: string) => {
    const arr = node.lookupMaybe(PDFName.of(name), PDFArray);
    return arr ? numbers(arr) : null;
  };
  const out = { images: [] as string[], fonts: new Set<string>() };
  collect(node.Resources(), out);
  const images = out.images.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  return { media: numbers(node.MediaBox()), trim: box("TrimBox"), bleed: box("BleedBox"), images, fonts: [...out.fonts].sort() };
}

export async function pdfSummary(pdf: Uint8Array): Promise<PdfSummary> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  // Структура — до pdfSha256: та меняет документ.
  const pages = doc.getPages().map((p) => pageSummary(p.node));
  return { sha256: await pdfSha256(doc), pages };
}

const FIELDS: [keyof PdfPage, string][] = [
  ["media", "MediaBox"],
  ["trim", "TrimBox"],
  ["bleed", "BleedBox"],
  ["images", "фото"],
  ["fonts", "шрифты"],
];
/** Сколько отличий структуры показывать по ключу: остальные — «и ещё N». */
const NOTES_LIMIT = 4;

const show = (v: PdfPage[keyof PdfPage]) => (v === null || v.length === 0 ? "нет" : v.join(" "));

/** Отличия структуры полос: «стр. 3: TrimBox 9 9 … → …». Число полос сверяет растр. */
export function pdfNotes(ref: PdfSummary, cur: PdfSummary): string[] {
  const notes: string[] = [];
  for (let i = 0; i < Math.min(ref.pages.length, cur.pages.length); i++) {
    for (const [field, label] of FIELDS) {
      const [a, b] = [ref.pages[i][field], cur.pages[i][field]];
      if (JSON.stringify(a) !== JSON.stringify(b)) notes.push(`стр. ${i + 1}: ${label} ${show(a)} → ${show(b)}`);
    }
  }
  return notes.length > NOTES_LIMIT ? [...notes.slice(0, NOTES_LIMIT), `и ещё ${notes.length - NOTES_LIMIT}`] : notes;
}
