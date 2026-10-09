export function photoUrl(photoId: string, size: "thumb" | "full" = "thumb") {
  return `/api/photos/${photoId}?size=${size}`;
}

/**
 * Фон обложки без текста: рисованные — статичный SVG, на снимках — JPEG. Версия в адресе меняется
 * вместе с кодом рисунков, а у шаблонов из CRM — ещё и с каждой правкой.
 */
export function coverArtUrl(template: { id: string; photo?: unknown; rev?: number }, formatId: string, lite = false, side: "front" | "back" = "front") {
  const ext = template.photo ? "jpg" : "svg";
  const v = `${process.env.COVER_ART_VERSION ?? "dev"}${template.rev ? `.${template.rev}` : ""}`;
  return `/api/covers/${template.id}-${formatId}${lite ? "-lite" : ""}${side === "back" ? "-back" : ""}.${ext}?v=${v}`;
}
