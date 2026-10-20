import "server-only";
import { inflateRawSync } from "node:zlib";

/**
 * Текст из документов Word (DOCX), Excel (XLSX) и простого текста — на сервере, без внешних сервисов: файл клиента
 * никуда не уходит. Свой разбор ZIP по центральному каталогу с лимитами (число файлов, распакованный размер каждого и
 * всех вместе) — защита от «zip-бомб». Макросы, внешние ссылки и встроенные объекты не трогаются: читается только XML
 * с текстом.
 */

/** Сколько распаковывать из одного архива всего и из одного файла внутри. */
const MAX_TOTAL_INFLATED = 20_000_000;
const MAX_ENTRY_INFLATED = 8_000_000;
const MAX_ENTRIES = 2_000;

interface ZipEntry {
  name: string;
  method: number;
  compressed: number;
  size: number;
  offset: number;
}

function centralDirectory(b: Buffer): ZipEntry[] | null {
  // Конец центрального каталога — в последних 64 КБ (+22 байта записи).
  const from = Math.max(0, b.length - 65_557);
  let eocd = -1;
  for (let i = b.length - 22; i >= from; i--) {
    if (b.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  if (count > MAX_ENTRIES || p >= b.length) return null;
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (p + 46 > b.length || b.readUInt32LE(p) !== 0x02014b50) return null;
    const method = b.readUInt16LE(p + 10);
    const compressed = b.readUInt32LE(p + 20);
    const size = b.readUInt32LE(p + 24);
    const nameLen = b.readUInt16LE(p + 28);
    const extraLen = b.readUInt16LE(p + 30);
    const commentLen = b.readUInt16LE(p + 32);
    const offset = b.readUInt32LE(p + 42);
    entries.push({ name: b.toString("utf8", p + 46, p + 46 + nameLen), method, compressed, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Файл из архива; null — нет, зашифрован, неизвестное сжатие или больше лимита. */
function readEntry(b: Buffer, e: ZipEntry, budget: { left: number }): string | null {
  if (e.size > MAX_ENTRY_INFLATED || e.size > budget.left) return null;
  const h = e.offset;
  if (h + 30 > b.length || b.readUInt32LE(h) !== 0x04034b50) return null;
  if (b.readUInt16LE(h + 6) & 0x01) return null; // зашифрован
  const start = h + 30 + b.readUInt16LE(h + 26) + b.readUInt16LE(h + 28);
  const raw = b.subarray(start, start + e.compressed);
  let data: Buffer;
  try {
    data = e.method === 0 ? raw : e.method === 8 ? inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_INFLATED }) : Buffer.alloc(0);
  } catch {
    return null;
  }
  if (e.method !== 0 && e.method !== 8) return null;
  budget.left -= data.length;
  return data.toString("utf8");
}

const unxml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");

/** Word: абзацы (w:p) — строками, ячейки таблиц (w:tc) — через « | ». */
function docxText(xml: string): string {
  return unxml(
    xml
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<\/w:tc>/g, " | ")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:br[^>]*\/>/g, "\n")
      .replace(/<(?!\/?w:t[ >])[^>]+>/g, "")
      .replace(/<\/?w:t[^>]*>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Excel: общие строки + ячейки первых листов — строками таблицы через табуляцию. */
function xlsxText(files: Map<string, string>): string {
  const shared = [...(files.get("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unxml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  const sheets = [...files.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  const out: string[] = [];
  for (const sheet of sheets.slice(0, 3)) {
    for (const row of (files.get(sheet) ?? "").matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [...row[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)].map(([, attrs, body]) => {
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "";
        return /t="s"/.test(attrs) ? (shared[Number(v)] ?? "") : unxml(v);
      });
      if (cells.some((c) => c.trim())) out.push(cells.join("\t"));
      if (out.length > 500) break;
    }
  }
  return out.join("\n").trim();
}

/** Текст документа клиента или null (не разобрать: битый архив, шифрование, лимиты). Возвращает не больше maxChars знаков. */
export function officeText(data: Uint8Array, mime: string, maxChars = 8000): string | null {
  if (/^text\//.test(mime)) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(data.subarray(0, maxChars * 4));
    return text.replace(/\r\n?/g, "\n").trim().slice(0, maxChars) || null;
  }
  const b = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const entries = centralDirectory(b);
  if (!entries) return null;
  const budget = { left: MAX_TOTAL_INFLATED };
  const want = (n: string) => n === "word/document.xml" || n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n);
  const files = new Map<string, string>();
  for (const e of entries) {
    if (!want(e.name)) continue;
    const text = readEntry(b, e, budget);
    if (text === null) return null;
    files.set(e.name, text);
  }
  const text = files.has("word/document.xml") ? docxText(files.get("word/document.xml")!) : xlsxText(files);
  return text ? text.slice(0, maxChars) : null;
}
