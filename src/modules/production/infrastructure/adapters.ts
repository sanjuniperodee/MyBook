import "server-only";
import { fileExists, getFile, putFile } from "@/lib/storage";
import { dedupe, withRenderSlot } from "@/lib/pdf/queue";
import type { BookRenderer, FileStore, PrintSpec, RenderQueue } from "../application/PrintFilesService";

export const storageFileStore: FileStore = { exists: fileExists, get: getFile, put: putFile };

export const pdfRenderQueue: RenderQueue = { run: (key, task) => dedupe(key, () => withRenderSlot(task)) };

/** Рендер через @react-pdf (тяжёлый модуль загружаем лениво). */
export const reactPdfRenderer: BookRenderer = {
  async renderPrintPackage(bookId, orderNumber) {
    const { loadBookBundle, printSpecText, renderPrintPackage } = await import("@/lib/pdf/render");
    const bundle = await loadBookBundle(bookId);
    if (!bundle) return null;
    const pkg = await renderPrintPackage(bundle);
    const printSpec: PrintSpec = { format: bundle.book.format, pageCount: pkg.pageCount, spineMm: pkg.spineMm, coverWidthMm: pkg.coverWidthMm, coverHeightMm: pkg.coverHeightMm, generatedAt: new Date().toISOString() };
    return { interior: pkg.interior, cover: pkg.cover, spec: Buffer.from(printSpecText(bundle, pkg, orderNumber), "utf8"), printSpec };
  },
  async renderReading(bookId) {
    const { loadBookBundle, renderReadingPdf } = await import("@/lib/pdf/render");
    const bundle = await loadBookBundle(bookId);
    return bundle ? renderReadingPdf(bundle) : null;
  },
};
