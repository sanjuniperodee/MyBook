import "server-only";
import { Defs, LinearGradient, RadialGradient, Stop } from "@react-pdf/renderer";
import { gradId, type Shape } from "@/lib/book/interior-art";

/**
 * Градиенты фигур для react-pdf. react-pdf берёт только ПЕРВЫЙ <Defs> среди детей <Svg> — поэтому все градиенты
 * рисунка собираются в один <Defs>, и он ставится первым; фигура ссылается на свой по url(#id). Координаты — доли
 * рамки фигуры (objectBoundingBox), как в HTML (components/interior/graphics.tsx).
 */
export function gradDefs(shapes: Shape[]): React.ReactElement | null {
  const seen = new Set<string>();
  const list: React.ReactElement[] = [];
  for (const s of shapes) {
    const g = s.grad;
    if (!g || !s.fill) continue;
    const id = gradId(s);
    if (seen.has(id)) continue;
    seen.add(id);
    const stops = g.stops.map(([o, c, a], i) => <Stop key={i} offset={o} stopColor={c} stopOpacity={a} />);
    list.push(
      g.type === "linear" ? (
        <LinearGradient key={id} id={id} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>
          {stops}
        </LinearGradient>
      ) : (
        <RadialGradient key={id} id={id} cx={g.cx} cy={g.cy} r={g.r} fx={g.fx ?? g.cx} fy={g.fy ?? g.cy}>
          {stops}
        </RadialGradient>
      ),
    );
  }
  return list.length ? <Defs key="grad-defs">{list}</Defs> : null;
}

/** Заливка фигуры: ссылка на её градиент из gradDefs или сам цвет. */
export const gradFill = (s: Shape): string | undefined => (s.grad && s.fill ? `url(#${gradId(s)})` : s.fill);
