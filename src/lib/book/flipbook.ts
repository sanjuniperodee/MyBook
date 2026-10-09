/**
 * Раскладка листаемой 3D-книги: какие полосы идут в каком порядке и как они складываются в листы.
 * Порядок повторяет PDF для типографии (modules/production/.../pdf/interior.tsx): титул, оборот
 * титула, посвящение, оглавление, главы (начальная полоса — всегда справа), финал.
 * Чистые функции без React — поэтому проверяются юнит-тестами.
 */

export type Face =
  | { kind: "blank" }
  | { kind: "title" }
  | { kind: "dedication" }
  | { kind: "toc" }
  | { kind: "opener"; chapter: number }
  | { kind: "text"; chapter: number; part: number }
  | { kind: "end" };

export interface FacePlanInput {
  hasDedication: boolean;
  hasToc: boolean;
  /** Сколько полос текста занимает каждая глава (0 — у главы нет текста). */
  textPages: number[];
}

export interface FacePlan {
  /** Полосы блока по порядку: индекс 0 — первая (правая) полоса после форзаца. */
  faces: Face[];
  /** Номер полосы (с 1), на которой начинается каждая глава. */
  chapterStarts: number[];
}

/** Нечётные полосы (1, 3, …) — правые; индекс в `faces` у них чётный. */
const isRecto = (index: number) => index % 2 === 0;

export function planFaces({ hasDedication, hasToc, textPages }: FacePlanInput): FacePlan {
  const faces: Face[] = [{ kind: "title" }, { kind: "blank" }];
  if (hasDedication) faces.push({ kind: "dedication" });
  if (hasToc && textPages.length) faces.push({ kind: "toc" });
  const chapterStarts: number[] = [];
  textPages.forEach((count, chapter) => {
    // Глава открывается на правой полосе: при необходимости оставляем левую пустой.
    if (!isRecto(faces.length)) faces.push({ kind: "blank" });
    chapterStarts.push(faces.length + 1);
    faces.push({ kind: "opener", chapter });
    for (let part = 0; part < count; part++) faces.push({ kind: "text", chapter, part });
  });
  faces.push({ kind: "end" });
  // Лист двусторонний — последняя полоса должна иметь пару.
  if (faces.length % 2) faces.push({ kind: "blank" });
  return { faces, chapterStarts };
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
