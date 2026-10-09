import "server-only";
import { deletePrefix, fileExists, getFile, putFile } from "@/shared/infrastructure/storage";
import { dedupe, withRenderSlot } from "@/modules/production/infrastructure/pdf/queue";
import type { BookBundle } from "@/modules/production/infrastructure/pdf/render";
import type { BookRenderer, FileStore, PrintSpec, RenderQueue } from "../application/PrintFilesService";

export const storageFileStore: FileStore = { exists: fileExists, get: getFile, put: putFile, deletePrefix };

export const pdfRenderQueue: RenderQueue = { run: (key, task) => dedupe(key, () => withRenderSlot(task)) };

/** Откуда рендер берёт содержимое книги (read-модель Authoring — подключается в корне композиции). */
export type BookBundleSource = (bookId: string) => Promise<BookBundle | null>;

/** Рендер через @react-pdf (тяжёлый модуль загружаем лениво). */
export function reactPdfRenderer(load: BookBundleSource): BookRenderer {
  const pdf = () => import("@/modules/production/infrastructure/pdf/render");
  return {
    async renderPrintPackage(bookId, orderNumber) {
      const bundle = await load(bookId);
      if (!bundle) return null;
      const { printSpecText, renderPrintPackage } = await pdf();
      const pkg = await renderPrintPackage(bundle, orderNumber);
      const printSpec: PrintSpec = { format: bundle.book.format, pageCount: pkg.pageCount, spineMm: pkg.spineMm, coverWidthMm: pkg.coverWidthMm, coverHeightMm: pkg.coverHeightMm, generatedAt: new Date().toISOString() };
      return { interior: pkg.interior, cover: pkg.cover, layout: pkg.layout, spec: Buffer.from(printSpecText(bundle, pkg, orderNumber), "utf8"), printSpec };
    },
    async renderLayout(bookId, orderNumber, block, cover) {
      const bundle = await load(bookId);
      if (!bundle) return null;
      const { PDFDocument } = await import("pdf-lib");
      const pageCount = (await PDFDocument.load(block)).getPageCount();
      return (await pdf()).renderLayoutScheme(bundle, pageCount, cover, orderNumber);
    },
    async renderReading(bookId) {
      const bundle = await load(bookId);
      if (!bundle) return null;
      return (await pdf()).renderReadingPdf(bundle);
    },
    async preview(bookId) {
      const bundle = await load(bookId);
      if (!bundle) return null;
      const { contentFingerprint, renderInterior } = await pdf();
      return { fingerprint: contentFingerprint(bundle), render: async () => (await renderInterior(bundle, "preview")).pdf };
    },
    async manuscript(bookId) {
      const bundle = await load(bookId);
      return bundle ? (await pdf()).plainText(bundle) : null;
    },
  };
}
