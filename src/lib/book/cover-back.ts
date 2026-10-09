/**
 * Задняя сторона обложки: раскладка в миллиметрах от левого верхнего угла задней крышки.
 * Одна функция на все отрисовки — PDF для типографии, 3D-книгу и превью в редакторе, —
 * поэтому то, что клиент видит на экране, совпадает с напечатанным.
 */
import { coverNamesLine, type CoverTemplate } from "./covers";
import type { FontKey } from "./fonts";
import type { Rect } from "./formats";

export type BackLayout = "quote" | "letter" | "photo" | "minimal";
export const backLayouts: BackLayout[] = ["quote", "letter", "photo", "minimal"];
export const DEFAULT_BACK_LAYOUT: BackLayout = "quote";
export const BACK_TEXT_MAX = 400;

export function isBackLayout(v: unknown): v is BackLayout {
  return typeof v === "string" && (backLayouts as string[]).includes(v);
}

export interface BackContent {
  layout: BackLayout;
  text: string;
  /** Подпись под цитатой и письмом — имя автора. */
  signature: string;
  /** «Асель и Гульнара» — для лаконичного варианта. */
  names: string;
  year: number | null;
  /** Размер фото для варианта «Фото» (пропорции); null — фото не выбрано. */
  photo: { width: number; height: number } | null;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type BackBlock =
  | (Box & {
      kind: "text";
      text: string;
      font: FontKey;
      /** Кегль, мм. */
      size: number;
      lineHeight: number;
      align: "center" | "left" | "right";
      italic: boolean;
      weight: number;
      color: string;
      /** Разрядка в em. */
      tracking?: number;
      upper?: boolean;
    })
  | (Box & { kind: "ornament"; ornament: NonNullable<CoverTemplate["ornament"]>["kind"]; color: string })
  | (Box & { kind: "photo"; /** Поле вокруг снимка (паспарту), мм. */ mat: number });

export interface BackDesign {
  /** Вариант, который реально нарисован: «Фото» без фото — «Цитата», пустая цитата — «Лаконично». */
  layout: BackLayout;
  blocks: BackBlock[];
  brand: { y: number; size: number; color: string };
}

/** Средняя ширина знака в долях кегля — для оценки переноса строк без измерения шрифта. С запасом. */
const CHAR: Record<FontKey, number> = { cormorant: 0.45, playfair: 0.55, lora: 0.52, ptserif: 0.52, montserrat: 0.6, onest: 0.57, badscript: 0.52, caveat: 0.44 };

/** Сколько строк займёт текст при данном кегле: перенос по словам, абзацы сохраняются. */
export function countLines(text: string, size: number, width: number, font: FontKey): number {
  const cw = CHAR[font] * size;
  const space = cw * 0.9;
  let lines = 0;
  for (const para of text.split("\n")) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines += 1;
      continue;
    }
    let line = 0;
    lines += 1;
    for (const word of words) {
      const ww = word.length * cw;
      if (line > 0 && line + space + ww > width) {
        lines += 1 + Math.floor(ww / width);
        line = ww % width;
      } else {
        if (ww > width) lines += Math.floor(ww / width);
        line += (line > 0 ? space : 0) + (ww % width || ww);
      }
    }
  }
  return lines;
}

/** Самый крупный кегль из диапазона, при котором текст помещается в рамку. */
export function fitSize(text: string, w: number, h: number, font: FontKey, min: number, max: number, lineHeight: number): number {
  for (let size = max; size > min; size -= 0.1) if (countLines(text, size, w, font) * size * lineHeight <= h) return Math.round(size * 100) / 100;
  return min;
}

const PT = 25.4 / 72;

/** Область текста и цвета: на повторённой композиции лица — как надписи лица, иначе — цвета задней стороны. */
function frame(template: CoverTemplate, W: number, H: number) {
  const a: Rect = template.back.mirror ? template.textArea : (template.back.area ?? { x: 0.14, y: 0.26, w: 0.72, h: 0.44 });
  const area: Box = { x: a.x * W, y: a.y * H, w: a.w * W, h: a.h * H };
  const mirror = !!template.back.mirror;
  return {
    area,
    main: mirror ? template.title.color : template.back.color,
    soft: mirror ? template.names.color : template.back.color,
    accent: mirror ? (template.ornament?.color ?? template.names.color) : template.back.color,
    font: template.back.font,
  };
}

/** Раскладка задней стороны крышки размером W×H мм. */
export function designBack(template: CoverTemplate, W: number, H: number, content: BackContent): BackDesign {
  const { area, main, soft, accent, font } = frame(template, W, H);
  const text = content.text.trim().slice(0, BACK_TEXT_MAX);
  let layout = content.layout;
  if (layout === "photo" && !content.photo) layout = "quote";
  if ((layout === "quote" || layout === "letter") && !text) layout = "minimal";

  const blocks: BackBlock[] = [];
  const ornament = template.ornament?.kind ?? "line";
  const orn = Math.min(4, W * 0.026);
  // Группа блоков выравнивается по вертикали в области: считаем высоты, затем раскладываем сверху вниз.
  const stack = (items: { h: number; gap?: number; place: (y: number) => void }[]) => {
    const total = items.reduce((s, it, i) => s + it.h + (i ? (it.gap ?? 0) : 0), 0);
    let y = area.y + Math.max(0, (area.h - total) / 2);
    items.forEach((it, i) => {
      if (i) y += it.gap ?? 0;
      it.place(y);
      y += it.h;
    });
  };
  const ornamentItem = (gap = 0) => ({
    h: orn,
    gap,
    place: (y: number) => blocks.push({ kind: "ornament", ornament, color: accent, x: area.x + area.w / 2 - orn / 2, y, w: orn, h: orn }),
  });
  const textItem = (t: string, opts: { size: number; lh: number; align: "center" | "left" | "right"; italic: boolean; color: string; weight?: number; gap?: number; tracking?: number; upper?: boolean; w?: number }) => {
    const w = opts.w ?? area.w;
    const h = countLines(t, opts.size, w, font) * opts.size * opts.lh;
    return {
      h,
      gap: opts.gap,
      place: (y: number) =>
        blocks.push({ kind: "text", text: t, font, size: opts.size, lineHeight: opts.lh, align: opts.align, italic: opts.italic, weight: opts.weight ?? 400, color: opts.color, tracking: opts.tracking, upper: opts.upper, x: area.x + (area.w - w) / 2, y, w, h }),
    };
  };
  const signature = content.signature.trim();

  if (layout === "quote") {
    const sig = signature ? `— ${signature}` : "";
    const reserve = orn + 3 + (sig ? 9 : 0);
    const size = fitSize(text, area.w, area.h - reserve, font, 8 * PT, 16 * PT, 1.45);
    stack([
      ornamentItem(),
      textItem(text, { size, lh: 1.45, align: "center", italic: true, color: main, gap: 3 }),
      ...(sig ? [textItem(sig, { size: Math.max(8 * PT, size * 0.82), lh: 1.3, align: "center", italic: true, color: soft, gap: 3.5 })] : []),
    ]);
  } else if (layout === "letter") {
    const sig = signature ? `— ${signature}` : "";
    const size = fitSize(text, area.w, area.h - (sig ? 9 : 0), font, 7.5 * PT, 13 * PT, 1.5);
    stack([
      textItem(text, { size, lh: 1.5, align: "left", italic: false, color: main }),
      ...(sig ? [textItem(sig, { size: size * 1.05, lh: 1.3, align: "right", italic: true, color: soft, gap: 3.5 })] : []),
    ]);
  } else if (layout === "photo" && content.photo) {
    const caption = text;
    const capSize = caption ? fitSize(caption, area.w, Math.min(area.h * 0.3, 16), font, 7.5 * PT, 11.5 * PT, 1.4) : 0;
    const capH = caption ? countLines(caption, capSize, area.w, font) * capSize * 1.4 : 0;
    const mat = Math.max(1.6, W * 0.012);
    const maxH = area.h - capH - (caption ? 4 : 0) - mat * 2;
    const maxW = area.w * 0.86 - mat * 2;
    const ratio = content.photo.width / Math.max(1, content.photo.height);
    let pw = maxW;
    let ph = pw / ratio;
    if (ph > maxH) {
      ph = maxH;
      pw = ph * ratio;
    }
    stack([
      { h: ph + mat * 2, place: (y) => blocks.push({ kind: "photo", mat, x: area.x + (area.w - pw - mat * 2) / 2, y, w: pw + mat * 2, h: ph + mat * 2 }) },
      ...(caption ? [textItem(caption, { size: capSize, lh: 1.4, align: "center", italic: true, color: main, gap: 4 })] : []),
    ]);
  } else {
    const names = content.names.trim();
    const items: { h: number; gap?: number; place: (y: number) => void }[] = [ornamentItem()];
    if (names) items.push(textItem(names, { size: fitSize(names, area.w, area.h * 0.4, font, 10 * PT, 22 * PT, 1.25), lh: 1.25, align: "center", italic: true, color: main, gap: 3.5 }));
    if (content.year) items.push(textItem(String(content.year), { size: 7 * PT, lh: 1.2, align: "center", italic: false, color: soft, gap: 2.5, tracking: 0.3, weight: 500 }));
    stack(items);
  }

  return { layout, blocks, brand: { y: H - 16, size: 6.5 * PT, color: template.back.mirror ? soft : template.back.color } };
}

/** Что печатается сзади — из настроек книги. Год — повода, если он задан, иначе текущий. */
export function backContent(
  book: { backLayout: string; backText: string; authorName: string; recipientName: string; hideRecipientOnCover: boolean; occasionDate: string | null },
  photo: { width: number; height: number } | null,
  now: Date,
): BackContent {
  return {
    layout: isBackLayout(book.backLayout) ? book.backLayout : DEFAULT_BACK_LAYOUT,
    text: book.backText,
    signature: book.authorName.trim(),
    names: coverNamesLine(book.authorName, book.recipientName, book.hideRecipientOnCover),
    year: book.occasionDate ? Number(book.occasionDate.slice(0, 4)) : now.getFullYear(),
    photo,
  };
}
