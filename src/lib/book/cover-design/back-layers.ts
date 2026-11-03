/**
 * Вариант оборота («Цитата», «Письмо», «Фото», «Фото во всю», «Полароиды», «Лаконично») → слои конструктора на тех же
 * местах, что в PDF: текст, орнамент, фото в паспарту и карточки, затемнение. Дальше клиент двигает и меняет их как на
 * лице. Координаты — доли задней крышки W×H мм (designBack считает в мм).
 */
import type { BackDesign } from "../cover-back";
import type { PhotoFrame } from "../photo-frame";
import { parseCoverDesign } from "./parse";
import type { CoverLayer, TextLayer } from "./types";

/** Слои под обрез заходят за край крышки не дальше этого (как у макетов лица). */
const EDGE = 0.06;
/** Затемнение «Фото во всю» — полосами внахлёст: градиента прозрачности в PDF нет. */
const SHADE_STEPS = 12;

export interface BackLayersSource {
  /** Фото оборота по местам раскладки (id фото книги). */
  photoIds: (string | null)[];
  /** Кадры фото оборота по местам («back:0»…). */
  frames?: (PhotoFrame | undefined)[];
  /** Строка имён — у «Лаконично» становится привязанной надписью (правка имён на лице меняет и её). */
  names?: string;
}

export function backLayersFromLayout(design: BackDesign, W: number, H: number, src: BackLayersSource): CoverLayer[] {
  const layers: CoverLayer[] = [];
  const box = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x / W, y: b.y / H, w: b.w / W, h: b.h / H });
  let i = 0;
  const id = (kind: string) => `b${kind}${i++}`;
  for (const b of design.blocks) {
    if (b.kind === "text") {
      // Запас по высоте: браузер и PDF переносят строки чуть иначе, чем оценка раскладки.
      const slack = b.size * 0.35;
      const bind = src.names && b.text === src.names.trim() ? ("names" as const) : undefined;
      const layer: TextLayer = {
        id: id("t"),
        kind: "text",
        ...(bind ? { bind } : {}),
        text: bind ? "" : b.text,
        ...box({ ...b, h: b.h + slack }),
        style: {
          font: b.font,
          weight: b.weight,
          ...(b.italic ? { italic: true } : {}),
          ...(b.upper ? { upper: true } : {}),
          size: b.size / W,
          color: b.color,
          ...(b.tracking ? { tracking: b.tracking } : {}),
          lineHeight: b.lineHeight,
          align: b.align,
          valign: "top",
        },
      };
      layers.push(layer);
    } else if (b.kind === "ornament") {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      if (b.ornament === "line") layers.push({ id: id("o"), kind: "shape", shape: "line", ...box({ x: cx - b.w * 2, y: cy - 0.75, w: b.w * 4, h: 1.5 }), stroke: b.color, strokeWidth: 0.0015 });
      else {
        const w = b.ornament === "dots" ? b.w * 1.6 : b.w;
        layers.push({ id: id("o"), kind: "decor", motif: b.ornament === "heart" ? "heart" : b.ornament === "star" ? "sparkle" : "dots", color: b.color, ...box({ x: cx - w / 2, y: b.y, w, h: b.h }) });
      }
    } else if (b.kind === "shade") {
      // Прозрачно до доли from, к низу — до opacity: полосы с одинаковой прозрачностью внахлёст.
      const step = (1 - b.from) / (SHADE_STEPS + 2);
      const opacity = Math.round((1 - Math.pow(1 - b.opacity, 1 / SHADE_STEPS)) * 1000) / 1000;
      for (let k = 0; k < SHADE_STEPS; k++) {
        const y = b.from + k * step;
        layers.push({ id: id("s"), kind: "shape", shape: "rect", x: -EDGE, y, w: 1 + EDGE * 2, h: 1 + EDGE - y, fill: b.color, opacity });
      }
    } else {
      const photoId = src.photoIds[b.slot] ?? null;
      const frame = src.frames?.[b.slot];
      const image = { kind: "image" as const, photoId, ...(frame ? { frame } : {}) };
      if (b.frame === "bleed") {
        layers.push({ id: id("p"), ...image, x: -EDGE, y: -EDGE, w: 1 + EDGE * 2, h: 1 + EDGE * 2, mask: "rect" });
      } else if (b.frame === "mat") {
        layers.push({ id: id("p"), ...image, ...box(b), mask: "rect", border: { color: "#FFFFFF", width: b.mat / W } });
      } else {
        // Полароид: тень, белая карточка и снимок в ней — снимок поворачивается вокруг центра карточки, как в PDF.
        const rotate = b.rotate ?? 0;
        layers.push({ id: id("c"), kind: "shape", shape: "rect", ...box({ ...b, x: b.x + 0.3, y: b.y + 0.9 }), fill: "#000000", opacity: 0.18, ...(rotate ? { rotate } : {}) });
        layers.push({ id: id("c"), kind: "shape", shape: "rect", ...box(b), fill: "#FFFFFF", ...(rotate ? { rotate } : {}) });
        const mb = b.matBottom ?? b.mat;
        const pw = b.w - b.mat * 2;
        const ph = b.h - b.mat - mb;
        // Центр снимка относительно центра карточки (выше на половину разницы полей) — повёрнутый.
        const dy = (b.mat - mb) / 2;
        const a = (rotate * Math.PI) / 180;
        const cx = b.x + b.w / 2 - Math.sin(a) * dy;
        const cy = b.y + b.h / 2 + Math.cos(a) * dy;
        layers.push({ id: id("p"), ...image, ...box({ x: cx - pw / 2, y: cy - ph / 2, w: pw, h: ph }), mask: "rect", ...(rotate ? { rotate } : {}) });
      }
    }
  }
  // Через разбор: числа округлены так же, как при сохранении.
  return parseCoverDesign({ v: 1, background: { kind: "template" }, layers })!.layers;
}
