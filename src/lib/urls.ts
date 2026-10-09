export function photoUrl(photoId: string, size: "thumb" | "full" = "thumb") {
  return `/api/photos/${photoId}?size=${size}`;
}

/** Фон обложки без текста — статичный SVG; версия в адресе меняется вместе с кодом рисунков. */
export function coverArtUrl(templateId: string, formatId: string, lite = false, side: "front" | "back" = "front") {
  return `/api/covers/${templateId}-${formatId}${lite ? "-lite" : ""}${side === "back" ? "-back" : ""}.svg?v=${process.env.COVER_ART_VERSION ?? "dev"}`;
}
