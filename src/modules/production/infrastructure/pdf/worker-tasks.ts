import type { BookBundle } from "./render";

/**
 * Задачи вёрстки PDF, которые выполняются в отдельном потоке (pdf/worker.ts): вёрстка react-pdf — чистые вычисления
 * на JS и на десятки секунд занимала главный поток, сайт в это время не отвечал. Содержимое книги (bundle) приходит
 * готовым из основного процесса — воркер не ходит в базу, только читает фото из хранилища.
 */
export type PdfTask =
  | { task: "printPackage"; bundle: BookBundle; orderNumber: number }
  | { task: "layout"; bundle: BookBundle; pageCount: number; cover: Uint8Array }
  | { task: "reading"; bundle: BookBundle }
  | { task: "preview"; bundle: BookBundle; watermark?: boolean };

export interface PrintPackageResult {
  interior: Uint8Array;
  cover: Uint8Array;
  layout: Uint8Array;
  spec: Uint8Array;
  pageCount: number;
  spineMm: number;
  coverWidthMm: number;
  coverHeightMm: number;
}

/** Результат задачи: для printPackage — пакет файлов, для остальных — один PDF. */
export type PdfTaskResult<T extends PdfTask> = T extends { task: "printPackage" } ? PrintPackageResult : Uint8Array;

/** Выполняет задачу в текущем потоке — и в воркере, и запасным путём, когда воркера нет (next dev). */
export async function runPdfTask(t: PdfTask): Promise<PrintPackageResult | Uint8Array> {
  const r = await import("./render");
  switch (t.task) {
    case "printPackage": {
      const pkg = await r.renderPrintPackage(t.bundle);
      const spec = Buffer.from(r.printSpecText(t.bundle, pkg, t.orderNumber), "utf8");
      return { interior: pkg.interior, cover: pkg.cover, layout: pkg.layout, spec, pageCount: pkg.pageCount, spineMm: pkg.spineMm, coverWidthMm: pkg.coverWidthMm, coverHeightMm: pkg.coverHeightMm };
    }
    case "layout":
      return r.renderLayoutScheme(t.bundle, t.pageCount, Buffer.from(t.cover));
    case "reading":
      return r.renderReadingPdf(t.bundle);
    case "preview":
      return (await r.renderInterior(t.bundle, "preview", { watermark: t.watermark })).pdf;
  }
}
