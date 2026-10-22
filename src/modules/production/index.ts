export {
  BookPreviewService,
  PrintFilesService,
  RasterizerMissingError,
  type BookRenderer,
  type FileStore,
  type PageRaster,
  type PrintFileKind,
  type PrintJob,
  type PrintSpec,
  type RenderQueue,
  type ScreenDraft,
} from "./application/PrintFilesService";
export { RenderProgress, type RenderEvent, type RenderKind, type RenderReport, type RenderSnapshot, type RenderStage } from "./application/RenderProgress";
export { pdfRenderQueue, reactPdfRenderer, storageFileStore } from "./infrastructure/adapters";
export { pdfPageRaster } from "./infrastructure/pageRaster";
export { coverPhotoDataUrl, coverPhotoResized, isCoverPhotoKey } from "./infrastructure/coverPhotos";

/** PDF подарочного сертификата. Рендерер тяжёлый, поэтому загружается только при первом вызове. */
export async function renderGiftPdf(d: import("./infrastructure/pdf/gift").GiftPdfData): Promise<Buffer> {
  const pdf = await import("./infrastructure/pdf/gift");
  return pdf.renderGiftPdf(d);
}
