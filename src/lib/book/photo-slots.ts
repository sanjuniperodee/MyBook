import type { BackDesign } from "./cover-back";
import { renderCoverSvg, type CoverTemplate } from "./covers";
import type { SlotInfo } from "./cover-kit";
import { coverFrontGeometry, type BookFormat } from "./formats";

/** Место под фото в долях (0…1) от своей стороны обложки; rotate — поворот карточки вокруг центра, градусы. */
export interface SlotBox {
  slot: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rotate?: number;
  /** Центр вращения карточки — в долях самого места (поле карточки может быть несимметричным). */
  origin?: { x: number; y: number };
}

const round = (v: number) => Math.round(v * 10000) / 10000;

/** Места под фото на лице: их сообщает сам шаблон при рисовании, поэтому здесь не нужно знать ни одну обложку по отдельности. */
export function frontSlotBoxes(template: CoverTemplate, format: BookFormat): SlotBox[] {
  const g = coverFrontGeometry(format);
  const found: SlotInfo[] = [];
  renderCoverSvg(template, g, { uid: "slots", onSlot: (s) => found.push(s) }, { noTexture: true });
  return found.map((s) => ({
    slot: s.slot,
    x: round(s.rect.x / g.width),
    y: round(s.rect.y / g.height),
    w: round(s.rect.w / g.width),
    h: round(s.rect.h / g.height),
    // Карточка повёрнута (полароид, марка, плёнка): рамка кадра в редакторе поворачивается вместе с ней.
    ...(s.rotate ? { rotate: s.rotate.deg, origin: { x: round((s.rotate.cx - s.rect.x) / s.rect.w), y: round((s.rotate.cy - s.rect.y) / s.rect.h) } } : {}),
  }));
}

/** Места под фото на обороте: сам снимок внутри поля (паспарту) карточки. Размеры задней крышки — в мм. */
export function backSlotBoxes(design: BackDesign, widthMm: number, heightMm: number): SlotBox[] {
  return design.blocks.flatMap((b) => {
    if (b.kind !== "photo") return [];
    const top = b.mat;
    const bottom = b.frame === "polaroid" ? (b.matBottom ?? b.mat) : b.mat;
    const w = b.w - b.mat * 2;
    const h = b.h - top - bottom;
    if (w <= 0 || h <= 0) return [];
    // Поворот карточки идёт вокруг её центра, а не центра снимка: центр вращения задаём относительно места.
    const origin = { x: round((b.w / 2 - b.mat) / w), y: round((b.h / 2 - top) / h) };
    return [{ slot: b.slot, x: round((b.x + b.mat) / widthMm), y: round((b.y + top) / heightMm), w: round(w / widthMm), h: round(h / heightMm), rotate: b.rotate, origin }];
  });
}
