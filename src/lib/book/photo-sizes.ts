/**
 * Размеры фото в тексте словами — ширина в процентах от ширины текста (InlinePhotoStyle.width). Те же ступени, что у
 * настройки «Размер» фото в ответе; по ним помощник в кабинете называет и меняет размер фото.
 */
export const PHOTO_SIZE_WIDTHS = { small: 33, medium: 50, large: 75, full: 100 } as const;
export type PhotoSizeWord = keyof typeof PHOTO_SIZE_WIDTHS;
export const PHOTO_SIZE_WORDS = Object.keys(PHOTO_SIZE_WIDTHS) as PhotoSizeWord[];

/** Ширина словом: ближайшая ступень (ползунок даёт и промежуточные). */
export function photoSizeWord(width: number): PhotoSizeWord {
  let best: PhotoSizeWord = "small";
  for (const w of PHOTO_SIZE_WORDS) if (Math.abs(PHOTO_SIZE_WIDTHS[w] - width) < Math.abs(PHOTO_SIZE_WIDTHS[best] - width)) best = w;
  return best;
}
