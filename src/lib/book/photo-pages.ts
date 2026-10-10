/**
 * Фотостраницы блока: где стоит каждый снимок, его подпись и рамка в стиле оформления.
 * Геометрия общая для PDF (react-pdf), подготовки картинок (кадр и размер в dpi) и HTML-превью,
 * поэтому снимки в превью и в печати лежат одинаково. Единицы — мм от левого верхнего угла
 * обрезного формата; рамки — фигуры interior-art (under — под снимком, over — поверх).
 */
import type { BookFormat, Rect } from "./formats";
import type { InteriorDesign, InteriorSizes } from "./interiors";
import type { Shape } from "./interior-art";
import { n } from "./cover-kit";

const PT = 25.4 / 72;

/**
 * Оформление снимка: без рамки, тонкая линия, двойная рамка, полароид, уголки старого альбома, скотч,
 * белое паспарту с тенью (как отпечаток в галерее) и мягкая тень приподнятого снимка.
 */
export type PhotoFrame = "none" | "hairline" | "double" | "polaroid" | "corners" | "tape" | "mat" | "shadow";
/** Подпись: курсивом основного шрифта, от руки или прописными, как служебные надписи. */
export type PhotoCaption = "italic" | "hand" | "label";

interface PhotoLike {
  id: string;
  width: number;
  height: number;
  caption: string;
  layout: string;
}

export interface PhotoCell {
  id: string;
  /** Где лежит сам снимок. */
  img: Rect;
  /** cover — снимок заполняет место и обрезается (сетка), contain — виден целиком. */
  fit: "contain" | "cover";
  /** Подпись: текст, область и кегль в пунктах; inside — в нижнем поле полароида (одной строкой). */
  caption: { text: string; box: Rect; size: number; inside: boolean } | null;
}

export interface PhotoPagePlan {
  cells: PhotoCell[];
  under: Shape[];
  over: Shape[];
}

/** Полоса набора фотостраницы — та же, что у текста (поля симметричны, как в PDF). */
export function photoArea(format: BookFormat, margins: { marginTop: number; marginBottom: number; marginInner: number; marginOuter: number }): Rect {
  const side = (margins.marginInner + margins.marginOuter) / 2;
  return { x: side, y: margins.marginTop, w: format.widthMm - side * 2, h: format.heightMm - margins.marginTop - margins.marginBottom };
}

/** Места под снимки на странице. «Сетка» — до четырёх фото, «половинки» — по два одно над другим. */
export function photoCells(group: PhotoLike[], area: Rect): Rect[] {
  const { x, y, w, h } = area;
  if (group[0]?.layout === "grid" && group.length > 1) {
    const g = Math.min(w, h) * 0.045;
    const hw = (w - g) / 2;
    const hh = (h - g) / 2;
    if (group.length === 2) {
      const wide = group.every((p) => p.width >= p.height);
      return wide
        ? [
            { x, y, w, h: hh },
            { x, y: y + hh + g, w, h: hh },
          ]
        : [
            { x, y, w: hw, h },
            { x: x + hw + g, y, w: hw, h },
          ];
    }
    const top = group.length === 3 ? (h - g) * 0.56 : hh;
    const bottom = h - g - top;
    const cells: Rect[] = group.length === 3 ? [{ x, y, w, h: top }] : [{ x, y, w: hw, h: top }, { x: x + hw + g, y, w: hw, h: top }];
    cells.push({ x, y: y + top + g, w: hw, h: bottom }, { x: x + hw + g, y: y + top + g, w: hw, h: bottom });
    return cells;
  }
  if (group.length > 1 || group[0]?.layout === "half") {
    const g = h * 0.06;
    const hh = (h - g) / 2;
    if (group.length === 1) return [{ x, y: y + (h - hh) / 2, w, h: hh }];
    return [
      { x, y, w, h: hh },
      { x, y: y + hh + g, w, h: hh },
    ];
  }
  return [area];
}

/** Поля вокруг снимка под рамку, мм: сверху, по бокам, снизу (у полароида — считаются от ширины карточки). */
function frameRoom(frame: PhotoFrame) {
  switch (frame) {
    case "hairline":
      return { t: 2.4, s: 2.4, b: 2.4 };
    case "double":
      return { t: 3.6, s: 3.6, b: 3.6 };
    case "corners":
      return { t: 1.2, s: 1.2, b: 1.2 };
    case "tape":
      return { t: 3, s: 1.5, b: 0.5 };
    case "mat":
      return { t: 5.5, s: 5.5, b: 5.5 };
    case "shadow":
      return { t: 1, s: 1.5, b: 2.5 };
    default:
      return { t: 0, s: 0, b: 0 };
  }
}

/** Доли ширины карточки полароида: поле сверху и по бокам, нижнее поле. */
const POLA = { pad: 0.05, bottom: 0.17 };

/** Кегль подписи на фотостранице, pt. */
export function photoCaptionSize(design: InteriorDesign, S: InteriorSizes) {
  return design.photos.caption === "hand" ? S.caption * 1.5 : design.photos.caption === "label" ? S.caption * 0.8 : S.caption;
}

/** Сколько строк займёт подпись: оценка по средней ширине знака (подписи короткие, с запасом). */
function captionLines(text: string, sizePt: number, widthMm: number, hand: boolean) {
  const perLine = Math.max(8, Math.floor(widthMm / (sizePt * PT * (hand ? 0.42 : 0.52))));
  return Math.min(3, Math.ceil(text.length / perLine));
}

const rectPath = (r: Rect) => `M${n(r.x)},${n(r.y)} h${n(r.w)} v${n(r.h)} h${n(-r.w)}Z`;
const grow = (r: Rect, d: number): Rect => ({ x: r.x - d, y: r.y - d, w: r.w + d * 2, h: r.h + d * 2 });

/** Раскладка фотостраницы: места, кадр, подписи и рамки в цветах оформления. */
export function photoPagePlan(group: PhotoLike[], area: Rect, design: InteriorDesign, S: InteriorSizes): PhotoPagePlan {
  const { frame, caption: face, tape = "#E8D9B5" } = design.photos;
  const P = design.palette;
  const grid = group[0]?.layout === "grid" && group.length > 1;
  const size = photoCaptionSize(design, S);
  const lineH = size * PT * (face === "hand" ? 1.15 : 1.3);
  const cells: PhotoCell[] = [];
  const under: Shape[] = [];
  const over: Shape[] = [];
  const places = photoCells(group, area);
  // В сетке место под подписи — одинаковое у всех снимков страницы, чтобы ряды не разъезжались.
  const gridLines = grid ? Math.max(0, ...group.map((p, i) => (p.caption.trim() ? captionLines(p.caption.trim(), size, places[i].w, face === "hand") : 0))) : 0;

  places.forEach((cell, i) => {
    const p = group[i];
    const ratio = p.width / Math.max(1, p.height);
    const text = p.caption.trim();
    const fit: PhotoCell["fit"] = grid ? "cover" : "contain";
    let img: Rect;
    let caption: PhotoCell["caption"] = null;

    if (frame === "polaroid") {
      // Карточка: белое поле вокруг снимка, подпись — в нижнем поле одной строкой.
      let cw = cell.w;
      if (fit === "contain") cw = Math.min(cell.w, cell.h / (POLA.pad + POLA.bottom + (1 - POLA.pad * 2) / ratio));
      const pad = cw * POLA.pad;
      const bottom = cw * POLA.bottom;
      const iw = cw - pad * 2;
      const ih = fit === "contain" ? iw / ratio : cell.h - pad - bottom;
      const ch = pad + ih + bottom;
      const card = { x: cell.x + (cell.w - cw) / 2, y: cell.y + (cell.h - ch) / 2, w: cw, h: ch };
      img = { x: card.x + pad, y: card.y + pad, w: iw, h: ih };
      under.push({ kind: "rect", x: card.x + 0.5, y: card.y + 0.7, w: card.w, h: card.h, fill: "#000000", opacity: 0.05 });
      under.push({ kind: "rect", ...card, fill: "#FFFFFF", stroke: "#DDD6CE", width: 0.18 });
      if (text) {
        const s = Math.min(size, (bottom * 0.5) / PT);
        caption = { text, size: s, inside: true, box: { x: img.x, y: img.y + ih + (bottom - s * PT * 1.2) / 2, w: iw, h: s * PT * 1.2 } };
      }
    } else {
      const room = frameRoom(frame);
      const lines = text ? captionLines(text, size, cell.w, face === "hand") : 0;
      const reserved = grid ? gridLines : lines;
      const capH = reserved ? reserved * lineH + 2.4 : 0;
      const avail = { x: cell.x + room.s, y: cell.y + room.t, w: cell.w - room.s * 2, h: cell.h - room.t - room.b - capH };
      let w = avail.w;
      let h = avail.h;
      if (fit === "contain") {
        if (w / ratio > h) w = h * ratio;
        else h = w / ratio;
      }
      const blockH = room.t + h + room.b + capH;
      const top = cell.y + (cell.h - blockH) / 2;
      img = { x: cell.x + (cell.w - w) / 2, y: top + room.t, w, h };
      if (text) caption = { text, size, inside: false, box: { x: cell.x, y: img.y + h + room.b + 2.4, w: cell.w, h: lines * lineH } };

      if (frame === "mat") {
        // Паспарту: белое поле вокруг снимка, мягкая тень под ним и тонкая кромка выреза.
        const m = grow(img, 5);
        under.push(
          { kind: "rect", x: m.x + 0.3, y: m.y + 1.2, w: m.w, h: m.h, fill: "#000000", opacity: 0.045 },
          { kind: "rect", x: m.x + 0.15, y: m.y + 0.5, w: m.w, h: m.h, fill: "#000000", opacity: 0.07 },
          { kind: "rect", ...m, fill: "#FFFFFF", stroke: "#E2DACE", width: 0.15 },
        );
        over.push({ kind: "rect", ...img, stroke: "#000000", width: 0.15, opacity: 0.14 });
      } else if (frame === "shadow") {
        // Снимок приподнят над страницей: ступенчатая тень вниз — без размытия, одинаково в PDF и в браузере.
        for (const [d, dy, o] of [
          [1.2, 1.6, 0.035],
          [0.7, 1.0, 0.05],
          [0.3, 0.5, 0.07],
        ] as const)
          under.push({ kind: "rect", ...grow({ ...img, y: img.y + dy }, d), fill: "#000000", opacity: o });
      } else if (frame === "hairline") over.push({ kind: "rect", ...grow(img, 1.8), stroke: P.ornament, width: 0.22 });
      else if (frame === "double") over.push({ kind: "rect", ...grow(img, 1.6), stroke: P.ornament, width: 0.4 }, { kind: "rect", ...grow(img, 3), stroke: P.ornament, width: 0.15 });
      else if (frame === "corners") {
        // Уголки старого фотоальбома: треугольники на углах снимка с выходом за край.
        const L = Math.min(7, Math.min(w, h) * 0.1);
        const o = 0.8;
        for (const [sx, sy] of [
          [1, 1],
          [-1, 1],
          [1, -1],
          [-1, -1],
        ]) {
          const cx = sx > 0 ? img.x - o : img.x + w + o;
          const cy = sy > 0 ? img.y - o : img.y + h + o;
          over.push({ kind: "path", d: `M${n(cx)},${n(cy)} L${n(cx + sx * (L + o))},${n(cy)} L${n(cx)},${n(cy + sy * (L + o))}Z`, fill: P.ornament, opacity: 0.92 });
        }
      } else if (frame === "tape") {
        // Две полоски скотча на верхних углах.
        const tw = Math.min(26, w * 0.3);
        const th = tw * 0.28;
        for (const [x, a] of [
          [img.x + tw * 0.12, -35],
          [img.x + w - tw * 0.12, 35],
        ] as const)
          over.push({ kind: "path", d: rectPath({ x: -tw / 2, y: -th / 2, w: tw, h: th }), fill: tape, opacity: 0.78, transform: `translate(${n(x)},${n(img.y + th * 0.1)}) rotate(${a})` });
      }
    }
    cells.push({ id: p.id, img, fit, caption });
  });
  return { cells, under, over };
}

// ─── снимок на начальной полосе главы ───────────────────────────────────────

export interface OpenerPhotoPlan {
  /** Сам снимок; у «во всю ширину» и «во всю полосу» — с выходом за обрез на 3 мм, как графика под обрез. */
  img: Rect;
  /** Форма снимка: арка (скруглённый верх) или круг. В PDF снимок обрезается при подготовке, в браузере — CSS. */
  mask?: "arch" | "circle";
  /** Затемнение снимка снизу под светлый текст: прозрачно до доли from высоты, к низу — opacity. */
  shade?: { from: number; color: string; opacity: number };
  /** Карточка полароида (белое поле вокруг снимка) и её поворот, градусы. */
  card: (Rect & { rotate: number }) | null;
  under: Shape[];
  over: Shape[];
  /** С какой доли высоты полосы набора начинается блок с номером и названием главы. */
  textTop: number;
}

/** Пропорции кадра полароида на начальной полосе (ширина к высоте). */
export const OPENER_POLAROID_RATIO = 1.15;

/** Где на начальной полосе лежит снимок главы и с какой высоты пойдёт название. */
export function openerPhotoPlan(format: BookFormat, design: InteriorDesign, margins: { marginTop: number; marginBottom: number }): OpenerPhotoPlan | null {
  const kind = design.opener.photo;
  if (!kind) return null;
  const W = format.widthMm;
  const H = format.heightMm;
  const areaH = H - margins.marginTop - margins.marginBottom;
  const textTop = (bottom: number) => Math.min(0.75, (bottom + 13 - margins.marginTop) / areaH);
  if (kind === "bleed") {
    const h = H * 0.52;
    return { img: { x: -3, y: -3, w: W + 6, h: h + 3 }, card: null, under: [], over: [], textTop: textTop(h) };
  }
  const P = design.opener.fill ?? design.palette;
  if (kind === "full") {
    // Снимок на всю полосу, название — светлым по затемнению снизу.
    return { img: { x: -3, y: -3, w: W + 6, h: H + 6 }, card: null, shade: { from: 0.34, color: "#0B0907", opacity: 0.82 }, under: [], over: [], textTop: 0.6 };
  }
  if (kind === "arch") {
    const w = Math.min(W * 0.52, H * 0.34);
    const h = w * 1.3;
    const img = { x: (W - w) / 2, y: margins.marginTop + 1, w, h };
    const o = 2.6;
    const r = w / 2 + o;
    const top = img.y - o;
    const d = `M${n(img.x - o)},${n(img.y + h)} L${n(img.x - o)},${n(top + r)} A${n(r)},${n(r)} 0 0 1 ${n(img.x + w + o)},${n(top + r)} L${n(img.x + w + o)},${n(img.y + h)}`;
    return {
      img,
      mask: "arch",
      card: null,
      under: [],
      over: [
        { kind: "path", d, stroke: P.ornament, width: 0.3 },
        { kind: "path", d: `M${n(img.x - o - 7)},${n(img.y + h)} H${n(img.x + w + o + 7)}`, stroke: P.ornament, width: 0.3 },
        { kind: "circle", cx: img.x - o - 8.2, cy: img.y + h, r: 0.6, fill: P.ornament },
        { kind: "circle", cx: img.x + w + o + 8.2, cy: img.y + h, r: 0.6, fill: P.ornament },
      ],
      textTop: textTop(img.y + h),
    };
  }
  if (kind === "circle") {
    const d = Math.min(W * 0.58, H * 0.38);
    const img = { x: (W - d) / 2, y: margins.marginTop + 3, w: d, h: d };
    const cx = W / 2;
    const cy = img.y + d / 2;
    const R = d / 2 + 3.2;
    return {
      img,
      mask: "circle",
      card: null,
      under: [{ kind: "circle", cx: cx + d * 0.07, cy: cy + d * 0.06, r: d / 2, fill: P.rule, opacity: 0.55 }],
      over: [
        { kind: "path", d: `M${n(cx - R)},${n(cy)} A${n(R)},${n(R)} 0 1 0 ${n(cx + R)},${n(cy)} A${n(R)},${n(R)} 0 1 0 ${n(cx - R)},${n(cy)}Z`, stroke: P.ornament, width: 0.3 },
        ...[0, 1, 2, 3].map((i): Shape => ({ kind: "circle", cx: cx + Math.cos((i * Math.PI) / 2) * R, cy: cy + Math.sin((i * Math.PI) / 2) * R, r: 0.65, fill: P.ornament })),
      ],
      textTop: textTop(img.y + d),
    };
  }
  if (kind === "framed") {
    // Снимок в белом паспарту, как отпечаток на стене галереи: тень, поле и тонкая кромка выреза.
    const w = Math.min(W * 0.62, H * 0.44);
    const h = w / 1.25;
    const img = { x: (W - w) / 2, y: margins.marginTop + 7, w, h };
    const m = grow(img, Math.max(5, w * 0.075));
    return {
      img,
      card: null,
      under: [
        { kind: "rect", x: m.x + 0.4, y: m.y + 1.6, w: m.w, h: m.h, fill: "#000000", opacity: 0.05 },
        { kind: "rect", x: m.x + 0.2, y: m.y + 0.7, w: m.w, h: m.h, fill: "#000000", opacity: 0.08 },
        { kind: "rect", ...m, fill: "#FFFFFF" },
      ],
      over: [{ kind: "rect", ...img, stroke: "#000000", width: 0.15, opacity: 0.16 }],
      textTop: textTop(m.y + m.h),
    };
  }
  const cw = Math.min(W * 0.6, H * 0.43);
  const pad = cw * 0.05;
  const iw = cw - pad * 2;
  const ih = iw / OPENER_POLAROID_RATIO;
  const ch = pad + ih + cw * 0.15;
  const card = { x: (W - cw) / 2, y: margins.marginTop + 5, w: cw, h: ch, rotate: -2.5 };
  const cx = card.x + cw / 2;
  const cy = card.y + ch / 2;
  const a = (card.rotate * Math.PI) / 180;
  const tw = cw * 0.32;
  const th = cw * 0.09;
  return {
    img: { x: card.x + pad, y: card.y + pad, w: iw, h: ih },
    card,
    under: [{ kind: "path", d: rectPath({ x: card.x + 0.6, y: card.y + 1, w: cw, h: ch }), fill: "#000000", opacity: 0.09, transform: `rotate(${card.rotate} ${n(cx)} ${n(cy)})` }],
    // Скотч по центру верхнего края — там, где край окажется после поворота карточки.
    over: [{ kind: "path", d: rectPath({ x: -tw / 2, y: -th / 2, w: tw, h: th }), fill: design.photos.tape ?? "#E8D9B5", opacity: 0.8, transform: `translate(${n(cx + (ch / 2) * Math.sin(a))},${n(cy - (ch / 2) * Math.cos(a))}) rotate(3)` }],
    textTop: textTop(card.y + ch),
  };
}
