import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { deletePrefix, fileExists, getFile, storagePath } from "@/shared/infrastructure/storage";
import { dedupe, withRenderSlot } from "@/modules/production/infrastructure/pdf/queue";
import type { BookBundle } from "@/modules/production/infrastructure/pdf/render";
import { inPdfThread } from "@/modules/production/infrastructure/pdf/pool";
import type { BookRenderer, FileStore, PrintSpec, RenderQueue } from "../application/PrintFilesService";

/** Из потока PDF буферы приходят как Uint8Array — оборачиваем без копирования. */
const buf = (u: Uint8Array) => Buffer.from(u.buffer, u.byteOffset, u.byteLength);

/** Содержимое папки хранилища с временем изменения; папки нет — пусто. */
async function listFiles(prefix: string) {
  const dir = storagePath(prefix);
  const names = await readdir(dir).catch(() => [] as string[]);
  const entries = await Promise.all(names.map(async (name) => ({ name, modifiedMs: (await stat(path.join(dir, name)).catch(() => null))?.mtimeMs })));
  return entries.flatMap((e) => (e.modifiedMs === undefined ? [] : [{ name: e.name, modifiedMs: e.modifiedMs }]));
}

/**
 * Запись через временный файл рядом и rename (в пределах папки он атомарный): оборванная запись — перезапуск PM2 при
 * выкатке, нет места — не оставляет под ключом обрезанный файл, который кэш отдал бы как готовый.
 */
async function putAtomic(key: string, data: Buffer) {
  const full = storagePath(key);
  await mkdir(path.dirname(full), { recursive: true });
  const tmp = `${full}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  try {
    await writeFile(tmp, data);
    await rename(tmp, full);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}

export const storageFileStore: FileStore = { exists: fileExists, get: getFile, put: putAtomic, deletePrefix, list: listFiles };

export const pdfRenderQueue: RenderQueue = { run: (key, task) => dedupe(key, () => withRenderSlot(task)) };

/** Откуда рендер берёт содержимое книги (read-модель Authoring — подключается в корне композиции). */
type BookBundleSource = (bookId: string) => Promise<BookBundle | null>;

/**
 * Рендер через @react-pdf. Вёрстка идёт в отдельном потоке (pdf/pool.ts), чтобы сайт отвечал во время сборки PDF;
 * содержимое книги читается здесь и передаётся потоку целиком. Лёгкие вещи (отпечаток, текст) — в текущем потоке.
 */
export function reactPdfRenderer(load: BookBundleSource): BookRenderer {
  const pdf = () => import("@/modules/production/infrastructure/pdf/render");
  return {
    async renderPrintPackage(bookId, order, report) {
      const bundle = await load(bookId);
      if (!bundle) return null;
      const pkg = await inPdfThread({ task: "printPackage", bundle, order }, report);
      const printSpec: PrintSpec = { format: bundle.book.format, pageCount: pkg.pageCount, spineMm: pkg.spineMm, coverWidthMm: pkg.coverWidthMm, coverHeightMm: pkg.coverHeightMm, generatedAt: new Date().toISOString() };
      return { interior: buf(pkg.interior), cover: buf(pkg.cover), layout: buf(pkg.layout), spec: buf(pkg.spec), printSpec };
    },
    async renderLayout(bookId, block, cover, report) {
      const bundle = await load(bookId);
      if (!bundle) return null;
      const { PDFDocument } = await import("pdf-lib");
      const pageCount = (await PDFDocument.load(block)).getPageCount();
      return buf(await inPdfThread({ task: "layout", bundle, pageCount, cover }, report));
    },
    async renderReading(bookId, report) {
      const bundle = await load(bookId);
      if (!bundle) return null;
      return buf(await inPdfThread({ task: "reading", bundle }, report));
    },
    async preview(bookId) {
      const bundle = await load(bookId);
      if (!bundle) return null;
      const { contentFingerprint } = await pdf();
      const fp = contentFingerprint(bundle);
      return {
        fingerprint: fp,
        async render(report) {
          const res = await inPdfThread({ task: "preview", bundle }, report);
          return { pdf: buf(res.pdf), manifest: { fp, ...res.layout } };
        },
        watermark: async (file) => buf(await inPdfThread({ task: "watermark", pdf: file, language: bundle.book.language, format: bundle.book.format })),
      };
    },
    async manuscript(bookId) {
      const bundle = await load(bookId);
      return bundle ? (await pdf()).plainText(bundle) : null;
    },
  };
}
