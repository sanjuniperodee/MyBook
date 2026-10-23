/**
 * Раскладка листаемой 3D-книги. Полосы — экранная сборка (lib/book/book-build.ts), то есть страницы того же PDF,
 * что уйдёт в типографию: лист блока i — полосы 2i−1 (лицо, справа на развороте) и 2i (оборот, слева). Своей
 * раскладки у 3D-книги нет, поэтому номера страниц, главы и пустые полосы добивки — ровно как в PDF.
 * Чистые функции без React — поэтому проверяются юнит-тестами.
 */

/** Листов блока в книге из pageCount полос: печатный объём кратен 4, нечётный добился бы пустой полосой. */
export const leafCount = (pageCount: number) => Math.max(1, Math.ceil(pageCount / 2));

/**
 * Листов вместе с переплётом: обложка (оборот — форзац), листы блока, задняя обложка (лицо — форзац).
 * Индекс листа — это и позиция, при которой он уже перевёрнут: при позиции `pos` перевёрнуты листы < pos.
 */
export const sheetCount = (pageCount: number) => leafCount(pageCount) + 2;

/** Полосы листа блока (с 1). */
export const leafPages = (leaf: number) => ({ front: 2 * leaf - 1, back: 2 * leaf });

/** Лист и сторона полосы n: f — лицо (нечётная), b — оборот (чётная). */
export const pageLeaf = (n: number) => ({ leaf: Math.ceil(n / 2), side: n % 2 ? ("f" as const) : ("b" as const) });

/** Номера полос на видимом развороте при позиции r (число перевёрнутых листов); null — форзац или обложка. */
export function visibleSpread(r: number, sheetCount: number): { left: number | null; right: number | null } {
  const last = sheetCount - 1;
  const left = r >= 2 && r <= last ? 2 * (r - 1) : null;
  const right = r >= 1 && r < last ? 2 * r - 1 : null;
  return { left, right };
}

/**
 * Полосы, которые держим загруженными при позиции slot, по очереди: видимый разворот, затем следующий,
 * предыдущий, через один… — spreads разворотов в каждую сторону. Перевернуть лист — открыть соседний разворот,
 * поэтому его полосы уже должны быть; дальние не грузим (память телефона).
 */
export function pagesNear(slot: number, pageCount: number, spreads: number): number[] {
  const sheets = sheetCount(pageCount);
  const out: number[] = [];
  const add = (n: number | null) => {
    if (n !== null && n <= pageCount && !out.includes(n)) out.push(n);
  };
  for (let d = 0; d <= spreads; d++)
    for (const r of d ? [slot + d, slot - d] : [slot]) {
      const { left, right } = visibleSpread(r, sheets);
      add(left);
      add(right);
    }
  return out;
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
