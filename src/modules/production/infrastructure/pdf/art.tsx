import "server-only";
import { Circle, Path, Rect, Svg } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";
import type { Drawing, PageBox, Shape } from "@/lib/book/interior-art";
import { mm } from "@/lib/book/formats";

/** Фигуры из interior-art → элементы react-pdf <Svg>. */
function shapeElement(s: Shape, i: number) {
  switch (s.kind) {
    case "circle":
      return <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} fillOpacity={s.opacity} />;
    case "rect":
      return (
        <Rect
          key={i}
          x={s.x}
          y={s.y}
          width={s.w}
          height={s.h}
          fill={s.fill ?? "none"}
          fillOpacity={s.fill ? s.opacity : undefined}
          stroke={s.stroke}
          strokeWidth={s.width}
          strokeOpacity={s.stroke ? s.opacity : undefined}
        />
      );
    case "path":
      return (
        <Path
          key={i}
          d={s.d}
          fill={s.fill ?? "none"}
          fillOpacity={s.fill ? s.opacity : undefined}
          stroke={s.stroke}
          strokeWidth={s.width}
          strokeOpacity={s.stroke ? s.opacity : undefined}
          strokeLinecap={s.round ? "round" : undefined}
          strokeLinejoin={s.round ? "round" : undefined}
          transform={s.transform}
        />
      );
  }
}

/** Глиф или виньетка в строке: размер — в пунктах. */
export function PdfDrawing({ drawing, style }: { drawing: Drawing; style?: Style }) {
  return (
    <Svg width={drawing.w} height={drawing.h} viewBox={`0 0 ${drawing.w} ${drawing.h}`} style={style}>
      {drawing.shapes.map(shapeElement)}
    </Svg>
  );
}

/** Слой графики на всю полосу вместе с вылетами; координаты фигур — мм от угла обрезного формата. */
export function PdfPageLayer({ shapes, box }: { shapes: Shape[]; box: PageBox }) {
  if (!shapes.length) return null;
  const { w, h, bleed } = box;
  return (
    // fixed — слой не участвует в разбиении на страницы (иначе react-pdf переносит его на следующую полосу).
    <Svg
      fixed
      viewBox={`${-bleed} ${-bleed} ${w + bleed * 2} ${h + bleed * 2}`}
      style={{ position: "absolute", top: 0, left: 0, width: mm(w + bleed * 2), height: mm(h + bleed * 2) }}
    >
      {shapes.map(shapeElement)}
    </Svg>
  );
}
