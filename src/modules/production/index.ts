/** Публичный фасад контекста «Производство»: вёрстка PDF книги и сертификатов, предпросмотры полос и обложек, файлы для типографии, очередь сборки. В container — previews (BookPreviewService) и printFiles. */
export {
  BookPreviewService,
  PrintFilesService,
  PrintLayoutChangedError,
  RasterizerMissingError,
  type BookRenderer,
  type FileStore,
  type PageRaster,
  type PrintFileKind,
  type PrintFileOptions,
  type PrintJob,
  type PrintSpec,
  type RenderQueue,
  type ScreenDraft,
} from "./application/PrintFilesService";
export { RenderProgress, type RenderEvent, type RenderKind, type RenderReport, type RenderSnapshot, type RenderStage } from "./application/RenderProgress";
export { pdfRenderQueue, reactPdfRenderer, storageFileStore } from "./infrastructure/adapters";
export { pdfPageRaster } from "./infrastructure/pageRaster";
export { renderCoverBackPreview, renderCoverSpreadPreview, renderCoverPreview, renderPagesPreview, sampleBundle, type PreviewPicture } from "./infrastructure/coverPreview";
export { PAGES_IMAGE_WIDTHS, PAGES_SPREADS, pagesSample, pagesVersion, renderPagesSpreadsOnce, type PagesImageWidth, type PagesSample, type PagesSpread } from "./infrastructure/pagesPreview";
export { coverPhotoDataUrl, coverPhotoResized, isCoverPhotoKey } from "./infrastructure/coverPhotos";

/** PDF подарочного сертификата. Рендерер тяжёлый, поэтому загружается только при первом вызове. */
export async function renderGiftPdf(d: import("./infrastructure/pdf/gift").GiftPdfData): Promise<Buffer> {
  const pdf = await import("./infrastructure/pdf/gift");
  return pdf.renderGiftPdf(d);
}
