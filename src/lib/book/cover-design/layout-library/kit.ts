/**
 * Набор для макетов обложек: пропорции крышки формата, фото книги со снимком коллекции на замену, высоты строк и
 * короткие конструкторы слоёв. Координаты — доли крышки, кегль — доля её ширины (как во всей модели слоёв).
 */
import type { FontKey } from "../../fonts";
import { boardSize } from "../geometry";
import type { LayoutContext } from "../layouts";
import type { CoverLayer, DecorId, DecorLayer, ImageLayer, ShapeLayer, TextBind, TextLayer, TextStyle } from "../types";

type Box = { x: number; y: number; w: number; h: number };
type Extra = Partial<Pick<CoverLayer, "rotate" | "opacity" | "name" | "locked">>;

export interface Kit {
  /** Крышка, мм. */
  W: number;
  H: number;
  /** Ширина к высоте: высоты текста в долях высоты считаются через неё. */
  k: number;
  /** Квадратный формат. */
  sq: boolean;
  year: number;
  /** Высота блока текста, доля высоты крышки: строк × кегль × интерлиньяж. */
  th: (size: number, lines?: number, lh?: number) => number;
  /** Доля высоты крышки для отрезка в долях ширины (квадрат на крышке — {w, h: v(w)}). */
  v: (wFrac: number) => number;
  /** Место под фото: фото книги по номеру, иначе (и про запас) — снимок коллекции. */
  src: (i: number, stock: string) => Pick<ImageLayer, "photoId" | "stock">;
  text: (bind: TextBind | { own: string }, box: Box, style: Partial<TextStyle> & Pick<TextStyle, "font" | "size" | "color">, extra?: Extra) => TextLayer;
  image: (i: number, stock: string, box: Box, opts?: Partial<Omit<ImageLayer, "id" | "kind" | "x" | "y" | "w" | "h" | "photoId" | "stock">>) => ImageLayer;
  shape: (shape: ShapeLayer["shape"], box: Box, opts?: Partial<Omit<ShapeLayer, "id" | "kind" | "shape" | "x" | "y" | "w" | "h">>) => ShapeLayer;
  decor: (motif: DecorId, color: string, box: Box, extra?: Extra) => DecorLayer;
  /**
   * Повернуть группу слоёв как одно целое вокруг точки (cx, cy) в долях крышки: центр каждого слоя поворачивается
   * вокруг неё (в миллиметрах — с учётом пропорций крышки), а сам слой — на тот же угол.
   */
  group: <L extends CoverLayer>(layers: L[], cx: number, cy: number, deg: number) => L[];
}

export function kit(ctx: LayoutContext): Kit {
  const { w: W, h: H } = boardSize(ctx.format);
  const k = W / H;
  let n = 0;
  const id = (p: string) => `${p}${n++}`;
  const style = (s: Partial<TextStyle> & Pick<TextStyle, "font" | "size" | "color">): TextStyle => ({ weight: 400, align: "center", valign: "middle", lineHeight: 1.15, ...s, font: s.font as FontKey });
  return {
    W,
    H,
    k,
    sq: k > 0.85,
    year: new Date().getFullYear(),
    th: (size, lines = 1, lh = 1.15) => size * k * lh * lines,
    v: (w) => w * k,
    src: (i, stock) => ({ photoId: ctx.photos[i]?.id ?? null, stock }),
    text: (bind, box, s, extra) => ({
      id: id(typeof bind === "string" ? bind.slice(0, 3) : "txt"),
      kind: "text",
      ...(typeof bind === "string" ? { bind, text: "" } : { text: bind.own }),
      ...box,
      style: style(s),
      ...extra,
    }),
    image: (i, stock, box, opts) => ({ id: id("img"), kind: "image", photoId: ctx.photos[i]?.id ?? null, stock, ...box, ...opts }),
    shape: (shape, box, opts) => ({ id: id("shp"), kind: "shape", shape, ...box, ...opts }),
    decor: (motif, color, box, extra) => ({ id: id("dec"), kind: "decor", motif, color, ...box, ...extra, rotate: extra?.rotate || undefined }),
    group: (layers, cx, cy, deg) => {
      const a = (deg * Math.PI) / 180;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      return layers.map((l) => {
        const dx = (l.x + l.w / 2 - cx) * W;
        const dy = (l.y + l.h / 2 - cy) * H;
        const nx = cx + (dx * cos - dy * sin) / W;
        const ny = cy + (dx * sin + dy * cos) / H;
        return { ...l, x: nx - l.w / 2, y: ny - l.h / 2, rotate: (l.rotate ?? 0) + deg };
      });
    },
  };
}
