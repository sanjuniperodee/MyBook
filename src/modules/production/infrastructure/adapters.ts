import "server-only";
import { deletePrefix, fileExists, getFile, putFile } from "@/shared/infrastructure/storage";
import { dedupe, withRenderSlot } from "@/modules/production/infrastructure/pdf/queue";
import type { BookBundle } from "@/modules/production/infrastructure/pdf/render";
import { inPdfThread } from "@/modules/production/infrastructure/pdf/pool";
import type { BookRenderer, FileStore, PrintSpec, RenderQueue } from "../application/PrintFilesService";

/** Из потока PDF буферы приходят как Uint8Array — оборачиваем без копирования. */
const buf = (u: Uint8Array) => Buffer.from(u.buffer, u.byteOffset, u.byteLength);

export const storageFileStore: FileStore = { exists: fileExists, get: getFile, put: putFile, deletePrefix };

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
    async renderPrintPackage(bookId, orderNumber) {
      const bundle = await load(bookId);
      if (!bundle) return null;
      const pkg = await inPdfThread({ task: "printPackage", bundle, orderNumber });
      const printSpec: PrintSpec = { format: bundle.book.format, pageCount: pkg.pageCount, spineMm: pkg.spineMm, coverWidthMm: pkg.coverWidthMm, coverHeightMm: pkg.coverHeightMm, generatedAt: new Date().toISOString() };
      return { interior: buf(pkg.interior), cover: buf(pkg.cover), layout: buf(pkg.layout), spec: buf(pkg.spec), printSpec };
    },
    async renderLayout(bookId, block, cover) {
      const bundle = await load(bookId);
      if (!bundle) return null;
      const { PDFDocument } = await import("pdf-lib");
      const pageCount = (await PDFDocument.load(block)).getPageCount();
      return buf(await inPdfThread({ task: "layout", bundle, pageCount, cover }));
    },
    async renderReading(bookId) {
      const bundle = await load(bookId);
      if (!bundle) return null;
      return buf(await inPdfThread({ task: "reading", bundle }));
    },
    async preview(bookId, opts) {
      const bundle = await load(bookId);
      if (!bundle) return null;
      const { contentFingerprint } = await pdf();
      return { fingerprint: contentFingerprint(bundle), render: async () => buf(await inPdfThread({ task: "preview", bundle, watermark: opts?.watermark })) };
    },
    async manuscript(bookId) {
      const bundle = await load(bookId);
      return bundle ? (await pdf()).plainText(bundle) : null;
    },
  };
}
