export function photoUrl(photoId: string, size: "thumb" | "full" = "thumb") {
  return `/api/photos/${photoId}?size=${size}`;
}

/** Адреса фото по местам обложки; пустое место остаётся пустым (там рисуется заглушка). */
export function photoUrls(ids: (string | null)[], size: "thumb" | "full" = "thumb") {
  return ids.map((id) => (id ? photoUrl(id, size) : undefined));
}

/**
 * Фон обложки без текста: рисованные — статичный SVG, на снимках — JPEG. Версия в адресе меняется
 * вместе с кодом рисунков, а у шаблонов из CRM — ещё и с каждой правкой. backPlain — оборот без
 * повтора композиции лица (под карточками «Полароидов»).
 */
export function coverArtUrl(template: { id: string; photo?: unknown; rev?: number }, formatId: string, lite = false, side: "front" | "back" | "backPlain" = "front") {
  const ext = template.photo ? "jpg" : "svg";
  const v = `${process.env.COVER_ART_VERSION ?? "dev"}${template.rev ? `.${template.rev}` : ""}`;
  const suffix = side === "back" ? "-back" : side === "backPlain" ? "-backplain" : "";
  return `/api/covers/${template.id}-${formatId}${lite ? "-lite" : ""}${suffix}.${ext}?v=${v}`;
}
