export {
  BookPreviewService,
  PrintFilesService,
  type BookRenderer,
  type FileStore,
  type PrintFileKind,
  type PrintJob,
  type PrintSpec,
  type RenderQueue,
} from "./application/PrintFilesService";
export type { GiftPdfData } from "./infrastructure/pdf/gift";

/** PDF подарочного сертификата. Рендерер тяжёлый, поэтому загружается только при первом вызове. */
export async function renderGiftPdf(d: import("./infrastructure/pdf/gift").GiftPdfData): Promise<Buffer> {
  const pdf = await import("./infrastructure/pdf/gift");
  return pdf.renderGiftPdf(d);
}
