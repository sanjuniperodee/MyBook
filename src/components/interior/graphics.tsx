import type { CSSProperties } from "react";
import type { BookFormat } from "@/lib/book/formats";
import type { InteriorPalette } from "@/lib/book/interiors";
import { frameShapes, gradId, vignetteDrawing, type Drawing, type Grad, type Shape } from "@/lib/book/interior-art";
import { pageBox } from "@/lib/book/page-geometry";
import type { PageKit } from "./kit";
import type { PageUnits } from "./units";

/** Градиент фигуры в <defs> — в долях её рамки, как в PDF. */
function GradDef({ id, g }: { id: string; g: Grad }) {
  const stops = g.stops.map(([o, c, a], i) => <stop key={i} offset={o} stopColor={c} stopOpacity={a} />);
  return g.type === "linear" ? (
    <linearGradient id={id} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>
      {stops}
    </linearGradient>
  ) : (
    <radialGradient id={id} cx={g.cx} cy={g.cy} r={g.r} fx={g.fx ?? g.cx} fy={g.fy ?? g.cy}>
      {stops}
    </radialGradient>
  );
}

export function ShapeElement({ s }: { s: Shape }) {
  if (s.grad && s.fill) {
    const id = gradId(s);
    return (
      <g>
        <defs>
          <GradDef id={id} g={s.grad} />
        </defs>
        <ShapeElement s={{ ...s, grad: undefined, fill: `url(#${id})` }} />
      </g>
    );
  }
  switch (s.kind) {
    case "circle":
      return <circle cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} fillOpacity={s.opacity} />;
    case "rect":
      return (
        <rect
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
        <path
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

/** Глиф или виньетка в строке (размеры рисунка — в пунктах). */
export function InlineDrawing({ drawing, u, style }: { drawing: Drawing; u: PageUnits; style?: CSSProperties }) {
  return (
    <svg aria-hidden width={u.pt(drawing.w)} height={u.pt(drawing.h)} viewBox={`0 0 ${drawing.w} ${drawing.h}`} style={{ display: "block", flexShrink: 0, overflow: "visible", ...style }}>
      {drawing.shapes.map((s, i) => (
        <ShapeElement key={i} s={s} />
      ))}
    </svg>
  );
}

/** Слой графики на всю страницу (координаты — мм обрезного формата, вылеты обрезаются). */
export function PageLayer({ shapes, format }: { shapes: Shape[]; format: BookFormat }) {
  if (!shapes.length) return null;
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${format.widthMm} ${format.heightMm}`} preserveAspectRatio="none">
      {shapes.map((s, i) => (
        <ShapeElement key={i} s={s} />
      ))}
    </svg>
  );
}

/** Рамка дизайна вокруг страницы (фигуры в мм обрезного формата, без вылетов). */
export const pageFrame = (kit: PageKit, colors: InteriorPalette) => frameShapes(kit.design.frame, pageBox(kit.format, 0), colors);

export function Vignette({ kit, rule, colors, align = "center" }: { kit: PageKit; rule: number; colors: InteriorPalette; align?: "center" | "left" }) {
  const S = kit.sizes;
  return <InlineDrawing drawing={vignetteDrawing(kit.design.ornament, rule, colors)} u={kit.u} style={{ marginBlock: kit.u.pt(S.vignetteGap), alignSelf: align === "left" ? "flex-start" : "center" }} />;
}
