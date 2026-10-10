/**
 * Задняя сторона обложки: раскладка в миллиметрах от левого верхнего угла задней крышки.
 * Одна функция на все отрисовки — PDF для типографии, 3D-книгу и превью в редакторе, —
 * поэтому то, что клиент видит на экране, совпадает с напечатанным.
 */
import { coverNamesLine, type CoverTemplate } from "./covers";
import { photoHref, photoImage, type PhotoRef } from "./cover-kit";
import type { FontKey } from "./fonts";
import type { Rect } from "./formats";

export type BackLayout = "quote" | "letter" | "photo" | "fullPhoto" | "polaroids" | "minimal";
export const backLayouts: BackLayout[] = ["quote", "letter", "photo", "fullPhoto", "polaroids", "minimal"];
/** Варианты с фото и сколько снимков каждый умеет показать. */
export const BACK_PHOTO_SLOTS: Partial<Record<BackLayout, number>> = { photo: 1, fullPhoto: 1, polaroids: 3 };
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
  /** Размеры выбранных фото по порядку (пропорции): для вариантов «Фото», «Фото во всю» и «Полароиды». */
  photos: { width: number; height: number }[];
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
  | (Box & {
      kind: "photo";
      /** Какое по счёту фото из BackContent.photos. */
      slot: number;
      /**
       * mat — снимок в белом паспарту; polaroid — карточка с широким нижним полем;
       * bleed — во всю крышку и в печати дальше, под загибы сверху, снизу и с внешнего края.
       */
      frame: "mat" | "polaroid" | "bleed";
      /** Поле вокруг снимка, мм. */
      mat: number;
      /** Нижнее поле полароида, мм. */
      matBottom?: number;
      /** Поворот вокруг центра, градусы. */
      rotate?: number;
    })
  | (Box & {
      kind: "shade";
      /** Затемнение для текста поверх фото: прозрачное до доли from высоты, к низу — opacity. Под загибы — как bleed-фото. */
      color: string;
      opacity: number;
      from: number;
    });

export interface BackDesign {
  /** Вариант, который реально нарисован: «Фото» без фото — «Цитата», пустая цитата — «Лаконично». */
  layout: BackLayout;
  /** Рисунок оборота без повтора композиции лица: карточки лежат на чистом узоре, а не на плашке. */
  plainArt: boolean;
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

/** Вариант, который получится из выбранного при этом содержимом. */
export function resolveBackLayout(layout: BackLayout, text: string, photos: number): BackLayout {
  if (layout === "polaroids" && photos < 2) layout = photos ? "photo" : "quote";
  if ((layout === "photo" || layout === "fullPhoto") && !photos) layout = "quote";
  if ((layout === "quote" || layout === "letter") && !text) layout = "minimal";
  return layout;
}

/** Раскладка задней стороны крышки размером W×H мм. */
export function designBack(template: CoverTemplate, W: number, H: number, content: BackContent): BackDesign {
  const fr = frame(template, W, H);
  const { font } = fr;
  let { area, main, soft, accent } = fr;
  const text = content.text.trim().slice(0, BACK_TEXT_MAX);
  const layout = resolveBackLayout(content.layout, text, content.photos.length);

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
  const names = content.names.trim();
  /** Имена и год — когда текста нет. */
  const namesItems = (maxShare: number) => {
    const items: { h: number; gap?: number; place: (y: number) => void }[] = [ornamentItem()];
    if (names) items.push(textItem(names, { size: fitSize(names, area.w, area.h * maxShare, font, 10 * PT, 22 * PT, 1.25), lh: 1.25, align: "center", italic: true, color: main, gap: 3.5 }));
    if (content.year) items.push(textItem(String(content.year), { size: 7 * PT, lh: 1.2, align: "center", italic: false, color: soft, gap: 2.5, tracking: 0.3, weight: 500 }));
    return items;
  };
  /** Цитата с подписью, кегль — по месту. */
  const quoteItems = (min: number, max: number, withOrnament: boolean) => {
    const sig = signature ? `— ${signature}` : "";
    const reserve = (withOrnament ? orn + 3 : 0) + (sig ? 9 : 0);
    const size = fitSize(text, area.w, area.h - reserve, font, min, max, 1.45);
    return [
      ...(withOrnament ? [ornamentItem()] : []),
      textItem(text, { size, lh: 1.45, align: "center", italic: true, color: main, gap: withOrnament ? 3 : 0 }),
      ...(sig ? [textItem(sig, { size: Math.max(8 * PT, size * 0.82), lh: 1.3, align: "center", italic: true, color: soft, gap: 3.5 })] : []),
    ];
  };
  let brandColor = template.back.mirror ? soft : template.back.color;

  if (layout === "quote") {
    stack(quoteItems(8 * PT, 16 * PT, true));
  } else if (layout === "letter") {
    const sig = signature ? `— ${signature}` : "";
    const size = fitSize(text, area.w, area.h - (sig ? 9 : 0), font, 7.5 * PT, 13 * PT, 1.5);
    stack([
      textItem(text, { size, lh: 1.5, align: "left", italic: false, color: main }),
      ...(sig ? [textItem(sig, { size: size * 1.05, lh: 1.3, align: "right", italic: true, color: soft, gap: 3.5 })] : []),
    ]);
  } else if (layout === "photo") {
    const caption = text;
    const capSize = caption ? fitSize(caption, area.w, Math.min(area.h * 0.3, 16), font, 7.5 * PT, 11.5 * PT, 1.4) : 0;
    const capH = caption ? countLines(caption, capSize, area.w, font) * capSize * 1.4 : 0;
    const mat = Math.max(1.6, W * 0.012);
    const maxH = area.h - capH - (caption ? 4 : 0) - mat * 2;
    const maxW = area.w * 0.86 - mat * 2;
    const ratio = content.photos[0].width / Math.max(1, content.photos[0].height);
    let pw = maxW;
    let ph = pw / ratio;
    if (ph > maxH) {
      ph = maxH;
      pw = ph * ratio;
    }
    stack([
      { h: ph + mat * 2, place: (y) => blocks.push({ kind: "photo", slot: 0, frame: "mat", mat, x: area.x + (area.w - pw - mat * 2) / 2, y, w: pw + mat * 2, h: ph + mat * 2 }) },
      ...(caption ? [textItem(caption, { size: capSize, lh: 1.4, align: "center", italic: true, color: main, gap: 4 })] : []),
    ]);
  } else if (layout === "fullPhoto") {
    // Снимок во всю крышку, внизу — затемнение и светлый текст поверх.
    blocks.push({ kind: "photo", slot: 0, frame: "bleed", mat: 0, x: 0, y: 0, w: W, h: H });
    blocks.push({ kind: "shade", color: "#000000", opacity: 0.62, from: 0.42, x: 0, y: 0, w: W, h: H });
    area = { x: W * 0.12, y: H * 0.6, w: W * 0.76, h: H * 0.25 };
    main = "#FFFFFF";
    soft = "#F1EBE4";
    accent = "#FFFFFF";
    brandColor = "#FFFFFF";
    stack(text ? quoteItems(9 * PT, 16 * PT, false) : namesItems(0.45));
  } else if (layout === "polaroids") {
    // Две-три карточки внахлёст, под ними — подпись. Цвета — как на чистом фоне оборота.
    main = soft = accent = brandColor = template.back.color;
    const count = Math.min(3, content.photos.length);
    const cw = Math.min(W * 0.42, H * 0.3);
    const pad = cw * 0.06;
    const pw = cw - pad * 2;
    const bottom = cw * 0.2;
    const ch = pad + pw + bottom;
    const spots: [number, number, number][] =
      count >= 3
        ? [
            [0.31, 0.26, -7],
            [0.69, 0.29, 6],
            [0.5, 0.46, -2],
          ]
        : [
            [0.36, 0.3, -5],
            [0.64, 0.36, 5],
          ];
    spots.forEach(([fx, fy, rotate], slot) =>
      blocks.push({ kind: "photo", slot, frame: "polaroid", mat: pad, matBottom: bottom, rotate, x: fx * W - cw / 2, y: fy * H - ch / 2, w: cw, h: ch }),
    );
    const top = Math.max(...spots.map(([, fy]) => fy * H + ch / 2)) + 7;
    area = { x: W * 0.14, y: top, w: W * 0.72, h: Math.max(10, H - 24 - top) };
    stack(text ? quoteItems(9 * PT, 18 * PT, false) : namesItems(0.5));
  } else {
    stack(namesItems(0.4));
  }

  return { layout, plainArt: layout === "polaroids", blocks, brand: { y: H - 16, size: 6.5 * PT, color: brandColor } };
}

/**
 * Часть оборота, которая рисуется в растровом фоне развёртки (в PDF): фото «во всю» с затемнением —
 * под загибы сверху, снизу и с внешнего края — и мягкие тени под карточками. В браузере то же
 * рисуют <img>, CSS-градиент и box-shadow (components/cover/CoverBack). back — задняя крышка на развёртке, мм.
 */
export function backArtSvg(design: BackDesign, back: { x: number; y: number; w: number; h: number }, photos: (PhotoRef | undefined)[], uid: string) {
  const r = (v: number) => Math.round(v * 100) / 100;
  let defs = "";
  let out = "";
  design.blocks.forEach((b, i) => {
    if (b.kind === "photo" && b.frame === "bleed") {
      const ref = photos[b.slot];
      if (photoHref(ref)) out += photoImage(ref!, { x: 0, y: 0, w: r(back.x + b.w), h: r(back.y * 2 + b.h) });
    } else if (b.kind === "shade") {
      // Доля from — от высоты крышки; на развёртке с загибами пересчитываем в доли всей высоты.
      const H = back.y * 2 + b.h;
      const from = r((back.y + b.from * b.h) / H);
      defs += `<linearGradient id="${uid}g${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="${from}" stop-color="${b.color}" stop-opacity="0"/><stop offset="1" stop-color="${b.color}" stop-opacity="${b.opacity}"/></linearGradient>`;
      out += `<rect x="0" y="0" width="${r(back.x + b.w)}" height="${r(H)}" fill="url(#${uid}g${i})"/>`;
    } else if (b.kind === "photo") {
      const x = back.x + b.x;
      const y = back.y + b.y;
      const rot = b.rotate ? ` transform="rotate(${b.rotate} ${r(x + b.w / 2)} ${r(y + b.h / 2)})"` : "";
      if (!defs.includes(`id="${uid}s"`)) defs += `<filter id="${uid}s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.2"/></filter>`;
      out += `<rect x="${r(x + 0.3)}" y="${r(y + 0.9)}" width="${r(b.w)}" height="${r(b.h)}" fill="#000" fill-opacity="0.26" filter="url(#${uid}s)"${rot}/>`;
    }
  });
  return out ? `<defs>${defs}</defs>${out}` : "";
}

/** Что печатается сзади — из настроек книги. Год — повода, если он задан, иначе текущий. */
export function backContent(
  book: { backLayout: string; backText: string; authorName: string; recipientName: string; hideRecipientOnCover: boolean; occasionDate: string | null },
  photos: { width: number; height: number }[],
  now: Date,
): BackContent {
  return {
    layout: isBackLayout(book.backLayout) ? book.backLayout : DEFAULT_BACK_LAYOUT,
    text: book.backText,
    signature: book.authorName.trim(),
    names: coverNamesLine(book.authorName, book.recipientName, book.hideRecipientOnCover),
    year: book.occasionDate ? Number(book.occasionDate.slice(0, 4)) : now.getFullYear(),
    photos,
  };
}

/** Фото оборота по порядку: основное и остальные, без пустых и повторов. */
export function backPhotoIds(book: { backPhotoId: string | null; backPhotoExtra?: string[] | null }): string[] {
  return [...new Set([book.backPhotoId, ...(book.backPhotoExtra ?? [])].filter((id): id is string => !!id))];
}
