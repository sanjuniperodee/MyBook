/** Чек об оплате: скриншот или фото перевода, PDF из банка. */
export const RECEIPT_MAX_BYTES = 12 * 1024 * 1024;

export type ReceiptType = { ext: "jpg" | "png" | "webp" | "pdf"; mime: string };

const starts = (b: Uint8Array, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);

/** Тип файла определяется по содержимому, а не по имени и заявленному типу: подмена расширения не пройдёт. */
export function sniffReceipt(bytes: Uint8Array): ReceiptType | null {
  if (starts(bytes, [0xff, 0xd8, 0xff])) return { ext: "jpg", mime: "image/jpeg" };
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: "png", mime: "image/png" };
  if (starts(bytes, [0x52, 0x49, 0x46, 0x46]) && starts(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return { ext: "webp", mime: "image/webp" };
  if (starts(bytes, [0x25, 0x50, 0x44, 0x46])) return { ext: "pdf", mime: "application/pdf" };
  return null;
}

/** Имя файла для показа: без путей и управляющих символов, не длиннее 120 знаков. */
export function safeReceiptName(raw: string, ext: string) {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\x00-\x1f<>:"|?*]/g, "").trim().slice(0, 120);
  return clean || `чек.${ext}`;
}
