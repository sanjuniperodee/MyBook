/** Перевод типографских единиц книги в CSS: одна вёрстка — и в пикселях превью, и в cqw миниатюр. */
export interface PageUnits {
  /** Миллиметры обрезного формата → CSS-длина. */
  mm(v: number): string;
  /** Пункты (как в PDF) → CSS-длина. */
  pt(v: number): string;
}

export const PT_TO_MM = 25.4 / 72;

/** Страница известной ширины в пикселях: pxPerMm — пикселей на миллиметр. */
export function pxUnits(pxPerMm: number): PageUnits {
  return {
    mm: (v) => `${v * pxPerMm}px`,
    pt: (v) => `${v * PT_TO_MM * pxPerMm}px`,
  };
}

/** Страница-контейнер (container-type: inline-size) шириной widthMm: размеры в cqw, масштабируется без JS. */
export function cqwUnits(widthMm: number): PageUnits {
  const k = 100 / widthMm;
  return {
    mm: (v) => `${v * k}cqw`,
    pt: (v) => `${v * PT_TO_MM * k}cqw`,
  };
}
