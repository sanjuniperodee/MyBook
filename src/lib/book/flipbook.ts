/**
 * Раскладка листаемой 3D-книги: какие полосы идут в каком порядке и как они складываются в листы.
 * Порядок повторяет PDF для типографии (modules/production/.../pdf/interior/index.tsx): титул, оборот
 * титула (колофон), посвящение, оглавление, главы подряд (начальная полоса, текст, фотостраницы), галерея,
 * финал. Пустых полос между главами нет — как в PDF: номера страниц в оглавлении совпадают.
 * Чистые функции без React — поэтому проверяются юнит-тестами.
 */

export type Face =
  | { kind: "blank" }
  | { kind: "title" }
  /** Оборот титула: копирайт и выходные данные. */
  | { kind: "colophon" }
  | { kind: "dedication" }
  /** part — полоса оглавления по счёту (длинное оглавление по разделам занимает несколько). */
  | { kind: "toc"; part: number }
  | { kind: "opener"; chapter: number }
  | { kind: "text"; chapter: number; part: number }
  /** Фотостраница главы (как в PDF — после её текста); chapter = −1 — галерея в конце книги. */
  | { kind: "photos"; chapter: number; page: number }
  /** Начальная полоса галереи (фото, вынесенные в конец книги). */
  | { kind: "galleryOpener" }
  | { kind: "end" };

export interface FacePlanInput {
  hasDedication: boolean;
  hasToc: boolean;
  /** Сколько полос занимает оглавление (по умолчанию одна). */
  tocPages?: number;
  /** Сколько полос текста занимает каждая глава (0 — у главы нет текста). */
  textPages: number[];
  /** Сколько фотостраниц у каждой главы (после её текста). */
  photoPages?: number[];
  /** Фотостраницы галереи в конце книги (0 — галереи нет). */
  galleryPages?: number;
}

export interface FacePlan {
  /** Полосы блока по порядку: индекс 0 — первая (правая) полоса после форзаца. */
  faces: Face[];
  /** Номер полосы (с 1), на которой начинается каждая глава. */
  chapterStarts: number[];
  /** Номер полосы (с 1), на которой начинается галерея; null — галереи нет. Нужен строке галереи в оглавлении. */
  galleryStart: number | null;
}

export function planFaces({ hasDedication, hasToc, tocPages = 1, textPages, photoPages = [], galleryPages = 0 }: FacePlanInput): FacePlan {
  const faces: Face[] = [{ kind: "title" }, { kind: "colophon" }];
  if (hasDedication) faces.push({ kind: "dedication" });
  if (hasToc && textPages.length) for (let part = 0; part < Math.max(1, tocPages); part++) faces.push({ kind: "toc", part });
  const chapterStarts: number[] = [];
  textPages.forEach((count, chapter) => {
    chapterStarts.push(faces.length + 1);
    faces.push({ kind: "opener", chapter });
    for (let part = 0; part < count; part++) faces.push({ kind: "text", chapter, part });
    for (let page = 0; page < (photoPages[chapter] ?? 0); page++) faces.push({ kind: "photos", chapter, page });
  });
  let galleryStart: number | null = null;
  if (galleryPages) {
    galleryStart = faces.length + 1;
    faces.push({ kind: "galleryOpener" });
    for (let page = 0; page < galleryPages; page++) faces.push({ kind: "photos", chapter: -1, page });
  }
  faces.push({ kind: "end" });
  // Лист двусторонний — последняя полоса должна иметь пару.
  if (faces.length % 2) faces.push({ kind: "blank" });
  return { faces, chapterStarts, galleryStart };
}

/** Лицевая и оборотная сторона листа; null — полоса принадлежит переплёту, а не блоку. */
export type Sheet =
  | { kind: "cover" }
  | { kind: "back" }
  | { kind: "pages"; front: Face; back: Face; /** номера полос (с 1) */ frontNo: number; backNo: number };

/**
 * Листы по порядку: обложка (оборот — форзац), листы блока, задняя обложка (лицо — форзац).
 * Индекс листа — это и номер, при котором он уже перевёрнут: при позиции `pos` перевёрнуты листы < pos.
 */
export function planSheets(faces: Face[]): Sheet[] {
  const sheets: Sheet[] = [{ kind: "cover" }];
  for (let i = 0; i + 1 < faces.length; i += 2) {
    sheets.push({ kind: "pages", front: faces[i], back: faces[i + 1], frontNo: i + 1, backNo: i + 2 });
  }
  sheets.push({ kind: "back" });
  return sheets;
}

/** Номера полос на видимом развороте при позиции r (число перевёрнутых листов); null — форзац или обложка. */
export function visibleSpread(r: number, sheetCount: number): { left: number | null; right: number | null } {
  const last = sheetCount - 1;
  const left = r >= 2 && r <= last ? 2 * (r - 1) : null;
  const right = r >= 1 && r < last ? 2 * r - 1 : null;
  return { left, right };
}

/** Сколько листов вокруг позиции действительно рисовать: остальные — пустые заглушки. */
export const RENDER_WINDOW = 3;

export function clampPos(pos: number, sheetCount: number) {
  return Math.min(sheetCount - 1, Math.max(0, pos));
}

/**
 * Сдвиг книги по горизонтали в долях ширины страницы: закрытая книга лежит по центру,
 * а не смещена вправо (лицо) или влево (оборот) на полразворота.
 */
export function bookShift(pos: number, sheetCount: number) {
  const opening = Math.min(1, Math.max(0, pos));
  const closing = Math.min(1, Math.max(0, pos - (sheetCount - 2)));
  return -0.5 * (1 - opening) + 0.5 * closing;
}

/** Куда довернуть лист после жеста: по смещению и скорости. */
export function settle(base: number, pos: number, velocity: number, sheetCount: number) {
  const delta = pos - base;
  let target = base;
  if (delta > 0.3 || (delta > 0.05 && velocity > 0.0008)) target = base + 1;
  else if (delta < -0.3 || (delta < -0.05 && velocity < -0.0008)) target = base - 1;
  return Math.round(clampPos(target, sheetCount));
}
