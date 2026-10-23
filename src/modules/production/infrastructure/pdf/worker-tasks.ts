import type { Locale } from "@/i18n/config";
import type { RenderReport } from "../../application/RenderProgress";
import type { BookBundle, ScreenLayout } from "./render";

/**
 * Задачи вёрстки PDF, которые выполняются в отдельном потоке (pdf/worker.ts): вёрстка react-pdf — чистые вычисления
 * на JS и на десятки секунд занимала главный поток, сайт в это время не отвечал. Содержимое книги (bundle) приходит
 * готовым из основного процесса — воркер не ходит в базу, только читает фото из хранилища.
 */
export type PdfTask =
  | { task: "printPackage"; bundle: BookBundle; order: { number: number; plan?: string; quantity?: number } }
  | { task: "layout"; bundle: BookBundle; pageCount: number; cover: Uint8Array }
  | { task: "reading"; bundle: BookBundle }
  | { task: "preview"; bundle: BookBundle }
  | { task: "coverPreview"; bundle: BookBundle }
  | { task: "pagesPreview"; bundle: BookBundle }
  | { task: "watermark"; pdf: Uint8Array; language: Locale; format: string };

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

/** Экранная сборка: PDF без водяного знака и раскладка его полос. */
export interface ScreenBuildResult {
  pdf: Uint8Array;
  layout: ScreenLayout;
}

/** Результат задачи: для printPackage — пакет файлов, для preview — экранная сборка, для остальных — один PDF. */
export type PdfTaskResult<T extends PdfTask> = T extends { task: "printPackage" } ? PrintPackageResult : T extends { task: "preview" } ? ScreenBuildResult : Uint8Array;

/**
 * Выполняет задачу в текущем потоке — и в воркере, и запасным путём, когда воркера нет (next dev).
 * report — рендер докладывает о начале этапов (из воркера они уходят в основной поток сообщениями).
 */
export async function runPdfTask(t: PdfTask, report?: RenderReport): Promise<PrintPackageResult | ScreenBuildResult | Uint8Array> {
  const r = await import("./render");
  switch (t.task) {
    case "printPackage": {
      const pkg = await r.renderPrintPackage(t.bundle, report);
      const spec = Buffer.from(r.printSpecText(t.bundle, pkg, t.order), "utf8");
      return { interior: pkg.interior, cover: pkg.cover, layout: pkg.layout, spec, pageCount: pkg.pageCount, spineMm: pkg.spineMm, coverWidthMm: pkg.coverWidthMm, coverHeightMm: pkg.coverHeightMm };
    }
    case "layout":
      return r.renderLayoutScheme(t.bundle, t.pageCount, Buffer.from(t.cover));
    case "reading":
      return r.renderReadingPdf(t.bundle, report);
    case "preview":
      return r.renderScreenBuild(t.bundle, report);
    case "coverPreview":
      // Лицевая крышка одной страницей — ИИ-дизайнер показывает её модели, чтобы та проверила свою работу глазами.
      return new Uint8Array((await r.renderCover(t.bundle, 0, "preview", true)).pdf);
    case "pagesPreview":
      // Короткая выборка книги на настоящей вёрстке — ИИ-дизайнер осматривает страницы глазами.
      return new Uint8Array((await r.renderScreenBuild(t.bundle)).pdf);
    case "watermark":
      // pdf-lib разбирает и пересобирает весь файл — тоже в потоке PDF, чтобы не держать сайт.
      return (await import("./watermark")).watermarkPdf(t.pdf, t.language, t.format);
  }
}
