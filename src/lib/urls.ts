/** thumb — миниатюра, view — уменьшенная копия для просмотра (3D-книга), full — оригинал после обработки. */
export function photoUrl(photoId: string, size: "thumb" | "view" | "full" = "thumb") {
  return `/api/photos/${photoId}?size=${size}`;
}

/** Адреса фото по местам обложки; пустое место остаётся пустым (там рисуется заглушка). */
export function photoUrls(ids: (string | null)[], size: "thumb" | "view" | "full" = "thumb") {
  return ids.map((id) => (id ? photoUrl(id, size) : undefined));
}

/**
 * Фон обложки без текста: рисованные — статичный SVG, на снимках — WebP. Версия в адресе меняется
 * вместе с кодом рисунков, а у шаблонов из CRM — ещё и с каждой правкой. backPlain — оборот без
 * повтора композиции лица (под карточками «Полароидов»).
 */
/**
 * Фон обложки шаблона. Оборот — кусок развёртки: pages — страниц в книге (толщина сдвигает по развёртке рисунок и
 * снимок шаблона, растянутые на всю обложку); без них — типичная толщина.
 */
export function coverArtUrl(template: { id: string; photo?: unknown; samples?: unknown; rev?: number; lines?: false }, formatId: string, lite = false, side: "front" | "back" | "backPlain" = "front", pages?: number) {
  // Обложки на снимках и с фото клиента (на снимках-примерах) растрируются на сервере — WebP.
  const ext = template.photo || template.samples ? "webp" : "svg";
  const v = `${process.env.COVER_ART_VERSION ?? "dev"}${template.rev ? `.${template.rev}` : ""}`;
  const suffix = (side === "back" ? "-back" : side === "backPlain" ? "-backplain" : "") + (side !== "front" && pages ? `-p${Math.round(pages)}` : "");
  // -nl — без декоративных линий (books.cover_lines).
  return `/api/covers/${template.id}-${formatId}${template.lines === false ? "-nl" : ""}${lite ? "-lite" : ""}${suffix}.${ext}?v=${v}`;
}
