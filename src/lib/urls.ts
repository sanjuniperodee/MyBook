export function photoUrl(photoId: string, size: "thumb" | "full" = "thumb") {
  return `/api/photos/${photoId}?size=${size}`;
}

/** Адреса фото по местам обложки; пустое место остаётся пустым (там рисуется заглушка). */
export function photoUrls(ids: (string | null)[], size: "thumb" | "full" = "thumb") {
  return ids.map((id) => (id ? photoUrl(id, size) : undefined));
}

/** Фон обложки без текста — статичный SVG; версия в адресе меняется вместе с кодом рисунков. */
export function coverArtUrl(templateId: string, formatId: string, lite = false, side: "front" | "back" | "backPlain" = "front") {
  const suffix = side === "back" ? "-back" : side === "backPlain" ? "-backplain" : "";
  return `/api/covers/${templateId}-${formatId}${lite ? "-lite" : ""}${suffix}.svg?v=${process.env.COVER_ART_VERSION ?? "dev"}`;
}
