/**
 * Сборка рисунка из короткого описания (ArtSpec) — то, чем ИИ-дизайнер «рисует». Описание — холст w×h и список
 * элементов в координатах холста (начало слева сверху, y вниз): простые фигуры (круг, эллипс, прямоугольник,
 * многоугольник, звезда, лист, цветок, дуга, линия, волна, свой путь), повторы по кругу, вдоль линии и сеткой, зеркало,
 * группа с поворотом, а также готовые сцены, узоры и рамки (library.ts). Результат — обычный Drawing с цветами-ролями
 * main/accent: его одинаково рисуют HTML и PDF, а перекрасить можно выбором цвета слоя.
 * Ошибки собираются списком (по-русски) — по ним модель исправляет описание; всё, что собралось, остаётся в рисунке.
 */
import { n } from "../covers/svg-kit";
import type { Drawing, Shape } from "../interior-art";
import { leaf, wavePath } from "../interior-art/geometry";
import { sanitizeDrawing } from "./drawing";
import { ART_LIMITS, ArtError, circleShape, Fields, isObj, onCircle, poly, shape, transformAll, type Ctx, type Pt } from "./kit";
import { SCENES, SCENE_BUILDERS, border, pattern } from "./library";
import { ORNAMENTS, ORNAMENT_BUILDERS } from "./ornaments";
import { compose, mirrorM, parsePath, rotateM, scaleM, segsBox, translateM, writePath } from "./path";

export interface ArtResult {
  drawing: Drawing | null;
  errors: string[];
}

export const ART_ITEMS = ["path", "circle", "ellipse", "rect", "line", "poly", "star", "leaf", "flower", "arc", "wave", "ring", "row", "grid", "mirror", "group", ...SCENES, ...ORNAMENTS, "pattern", "border"] as const;

/** Описание одного элемента → фигуры. Вложенные элементы (ring, row, grid, mirror, group) собираются рекурсивно. */
function item(raw: unknown, ctx: Ctx, depth: number): Shape[] {
  if (!isObj(raw) || typeof raw.t !== "string") throw new ArtError(`элемент без поля t (${ART_ITEMS.join(", ")})`);
  const t = raw.t;
  if (!(ART_ITEMS as readonly string[]).includes(t)) throw new ArtError(`неизвестный элемент «${t}» (есть: ${ART_ITEMS.join(", ")})`);
  const f = new Fields(raw, t, ctx);
  const out = build(t, f, depth);
  ctx.shapes += out.length;
  if (ctx.shapes > ART_LIMITS.shapes) throw new ArtError(`слишком много фигур (больше ${ART_LIMITS.shapes}) — упростите рисунок или уменьшите повторы`);
  return out;
}

function children(f: Fields, key: string, depth: number): Shape[] {
  const list = f.o[key];
  if (!Array.isArray(list) && isObj(f.o[key])) return item(f.o[key], f.ctx, depth + 1);
  if (!Array.isArray(list) || !list.length) throw new ArtError(`${f.t}: нужно ${key} — элемент или список элементов`);
  if (depth + 1 > ART_LIMITS.depth) throw new ArtError(`${f.t}: слишком глубокая вложенность`);
  const out: Shape[] = [];
  for (const c of list.slice(0, ART_LIMITS.items)) out.push(...item(c, f.ctx, depth + 1));
  return out;
}

const pathOf = (pts: Pt[]) => poly(pts);

function build(t: string, f: Fields, depth: number): Shape[] {
  switch (t) {
    case "path": {
      if (typeof f.o.d !== "string") throw new ArtError("path: нужно поле d — строка пути SVG");
      const segs = parsePath(f.o.d);
      if (!segs) throw new ArtError("path: путь d не разобрался — допустимы команды M L H V C S Q T A Z");
      const closed = segs.some((s) => s[0] === "Z");
      const st = closed ? f.closed() : f.open();
      return [shape(writePath(segs), st)];
    }
    case "circle":
      return [circleShape(f.num("cx"), f.num("cy"), f.num("r", undefined, 0.1), f.closed())];
    case "ellipse": {
      const [cx, cy, rx, ry] = [f.num("cx"), f.num("cy"), f.num("rx", undefined, 0.1), f.num("ry", undefined, 0.1)];
      const d = `M${n(cx - rx)},${n(cy)} A${n(rx)},${n(ry)} 0 1 0 ${n(cx + rx)},${n(cy)} A${n(rx)},${n(ry)} 0 1 0 ${n(cx - rx)},${n(cy)}Z`;
      const rot = f.num("rot", 0, -360, 360);
      const s = shape(d, f.closed());
      return rot ? transformAll([s], rotateM(rot, cx, cy)) : [s];
    }
    case "rect": {
      const [x, y, w, h] = [f.num("x"), f.num("y"), f.num("w", undefined, 0.1), f.num("h", undefined, 0.1)];
      const r = Math.min(f.num("r", 0, 0, 1000), w / 2, h / 2);
      const d =
        r > 0
          ? `M${n(x + r)},${n(y)} L${n(x + w - r)},${n(y)} A${n(r)},${n(r)} 0 0 1 ${n(x + w)},${n(y + r)} L${n(x + w)},${n(y + h - r)} A${n(r)},${n(r)} 0 0 1 ${n(x + w - r)},${n(y + h)} L${n(x + r)},${n(y + h)} A${n(r)},${n(r)} 0 0 1 ${n(x)},${n(y + h - r)} L${n(x)},${n(y + r)} A${n(r)},${n(r)} 0 0 1 ${n(x + r)},${n(y)}Z`
          : pathOf([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]);
      const rot = f.num("rot", 0, -360, 360);
      const s = shape(d, f.closed());
      return rot ? transformAll([s], rotateM(rot, x + w / 2, y + h / 2)) : [s];
    }
    case "line": {
      const [x1, y1, x2, y2] = [f.num("x1"), f.num("y1"), f.num("x2"), f.num("y2")];
      return [shape(`M${n(x1)},${n(y1)} L${n(x2)},${n(y2)}`, f.open())];
    }
    case "poly": {
      const [cx, cy, r] = [f.num("cx"), f.num("cy"), f.num("r", undefined, 0.1)];
      const sides = f.int("n", 6, 3, 24);
      const rot = f.num("rot", 0, -360, 360);
      return [shape(pathOf(Array.from({ length: sides }, (_, i) => onCircle(cx, cy, r, rot + (360 * i) / sides))), f.closed())];
    }
    case "star": {
      const [cx, cy, r] = [f.num("cx"), f.num("cy"), f.num("r", undefined, 0.1)];
      const points = f.int("n", 5, 3, 24);
      const inner = f.num("inner", 0.42, 0.05, 0.95);
      const rot = f.num("rot", 0, -360, 360);
      return [shape(pathOf(Array.from({ length: points * 2 }, (_, i) => onCircle(cx, cy, i % 2 ? r * inner : r, rot + (180 * i) / points))), f.closed())];
    }
    case "leaf": {
      const [x, y, len] = [f.num("x"), f.num("y"), f.num("len", undefined, 0.5)];
      const angle = f.num("angle", 0, -720, 720) - 90;
      return [shape(leaf(x, y, len, angle, f.num("wide", 0.34, 0.1, 0.9)), f.closed())];
    }
    case "flower": {
      const [cx, cy, r] = [f.num("cx"), f.num("cy"), f.num("r", undefined, 1)];
      const petals = f.int("petals", 6, 3, 16);
      const rot = f.num("rot", 0, -360, 360);
      const st = f.closed();
      const out: Shape[] = [shape(Array.from({ length: petals }, (_, i) => leaf(cx, cy, r, rot + (360 * i) / petals - 90, f.num("wide", 0.5, 0.15, 0.9))).join(" "), { ...st, stroke: null })];
      const core = f.paint("core") ?? "accent";
      if (core) out.push(circleShape(cx, cy, r * f.num("coreSize", 0.2, 0.05, 0.6), { ...st, fill: core, stroke: null }));
      return out;
    }
    case "arc": {
      const [cx, cy, r] = [f.num("cx"), f.num("cy"), f.num("r", undefined, 0.1)];
      const from = f.num("from", 0, -720, 720);
      const to = f.num("to", 360, -720, 720);
      const st = f.open();
      if (Math.abs(to - from) >= 359.9) return [circleShape(cx, cy, r, { ...st, fill: null })];
      const a = onCircle(cx, cy, r, from);
      const b = onCircle(cx, cy, r, to);
      return [shape(`M${n(a.x)},${n(a.y)} A${n(r)},${n(r)} 0 ${Math.abs(to - from) > 180 ? 1 : 0} ${to > from ? 1 : 0} ${n(b.x)},${n(b.y)}`, st)];
    }
    case "wave": {
      const x0 = f.num("x0", 0);
      const x1 = f.num("x1", f.ctx.w);
      const y = f.num("y");
      const amp = f.num("amp", f.ctx.unit * 0.03, 0.1);
      const len = f.num("len", f.ctx.unit * 0.12, 1);
      const phase = f.num("phase", 0, 0, 1);
      const rows = f.int("rows", 1, 1, 12);
      const gap = f.num("gap", amp * 2.2, 0.1);
      const st = f.open();
      if ((x1 - x0) / len > 200) throw new ArtError("wave: слишком частые волны — увеличьте len");
      const d: string[] = [];
      for (let r = 0; r < rows; r++) d.push(wavePath(x0, x1, y + r * gap, amp, len, (phase + r * 0.5) % 1).d);
      return [shape(d.join(" "), st)];
    }
    case "ring": {
      const [cx, cy] = [f.num("cx"), f.num("cy")];
      const count = f.int("count", 8, 2, ART_LIMITS.repeat);
      const start = f.num("start", 0, -360, 360);
      const base = children(f, "of", depth);
      const out: Shape[] = [];
      for (let i = 0; i < count; i++) {
        out.push(...transformAll(base, rotateM(start + (360 * i) / count, cx, cy)));
        if (out.length > ART_LIMITS.shapes) throw new ArtError(`ring: слишком много фигур — уменьшите count`);
      }
      return out;
    }
    case "row": {
      const count = f.int("count", 5, 2, ART_LIMITS.repeat);
      const [dx, dy] = [f.num("dx", 0), f.num("dy", 0)];
      const turn = f.num("turn", 0, -360, 360);
      const base = children(f, "of", depth);
      const [bx, by] = turn ? centerOf(base) : [0, 0];
      const out: Shape[] = [];
      for (let i = 0; i < count; i++) {
        out.push(...transformAll(base, turn ? compose(translateM(dx * i, dy * i), rotateM(turn * i, bx, by)) : translateM(dx * i, dy * i)));
        if (out.length > ART_LIMITS.shapes) throw new ArtError("row: слишком много фигур — уменьшите count");
      }
      return out;
    }
    case "grid": {
      const cols = f.int("cols", 3, 1, 30);
      const rows = f.int("rows", 3, 1, 30);
      if (cols * rows > ART_LIMITS.cells) throw new ArtError(`grid: больше ${ART_LIMITS.cells} клеток`);
      const [dx, dy] = [f.num("dx"), f.num("dy")];
      const stagger = f.o.stagger === true;
      const base = children(f, "of", depth);
      const out: Shape[] = [];
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          out.push(...transformAll(base, translateM(dx * i + (stagger && j % 2 ? dx / 2 : 0), dy * j)));
          if (out.length > ART_LIMITS.shapes) throw new ArtError(`grid: слишком много фигур — уменьшите cols или rows`);
        }
      return out;
    }
    case "mirror": {
      const axis = f.str("axis", ["x", "y"] as const, "x");
      const at = f.num("at", axis === "x" ? f.ctx.w / 2 : f.ctx.h / 2);
      const base = children(f, "items", depth);
      return [...base, ...transformAll(base, mirrorM(axis, at))];
    }
    case "group": {
      const base = children(f, "items", depth);
      const [cx, cy] = f.has("about") && Array.isArray(f.o.about) && f.o.about.length === 2 ? [Number(f.o.about[0]), Number(f.o.about[1])] : [f.ctx.w / 2, f.ctx.h / 2];
      if (![cx, cy].every(Number.isFinite)) throw new ArtError("group: about — [x, y]");
      const m = compose(translateM(f.num("dx", 0), f.num("dy", 0)), compose(rotateM(f.num("rot", 0, -360, 360), cx, cy), scaleM(f.num("scale", 1, 0.05, 20), cx, cy)));
      return transformAll(base, m, f.num("opacity", 1, 0, 1));
    }
    case "pattern":
      return pattern(f);
    case "border":
      return border(f);
    default: {
      const build = SCENE_BUILDERS[t as keyof typeof SCENE_BUILDERS] ?? ORNAMENT_BUILDERS[t as keyof typeof ORNAMENT_BUILDERS];
      if (!build) throw new ArtError(`неизвестный элемент «${t}»`);
      return build(f);
    }
  }
}

/** Центр охвата фигур — вокруг него поворачиваются копии в row с turn. */
function centerOf(shapes: Shape[]): [number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of shapes) {
    const b = s.kind === "circle" ? { x0: s.cx - s.r, y0: s.cy - s.r, x1: s.cx + s.r, y1: s.cy + s.r } : s.kind === "rect" ? { x0: s.x, y0: s.y, x1: s.x + s.w, y1: s.y + s.h } : (() => {
      const segs = parsePath(s.d);
      const box = segs && segsBox(segs);
      return box ?? { x0: 0, y0: 0, x1: 0, y1: 0 };
    })();
    x0 = Math.min(x0, b.x0);
    y0 = Math.min(y0, b.y0);
    x1 = Math.max(x1, b.x1);
    y1 = Math.max(y1, b.y1);
  }
  return Number.isFinite(x0) ? [(x0 + x1) / 2, (y0 + y1) / 2] : [0, 0];
}

/**
 * Описание → рисунок. spec: { w, h, items: [...] }; w и h — холст (по умолчанию 200×200). Что не собралось — в errors,
 * остальное рисуется. Рисунок, который заметно выходит за холст, — тоже замечание.
 */
export function compileArt(spec: unknown): ArtResult {
  const errors: string[] = [];
  if (!isObj(spec)) return { drawing: null, errors: ["рисунок: нужен объект {w, h, items: [...]}"] };
  const [lo, hi] = ART_LIMITS.size;
  const dim = (v: unknown, name: string) => {
    if (v === undefined) return 200;
    if (typeof v !== "number" || !Number.isFinite(v)) {
      errors.push(`рисунок: ${name} — число от ${lo} до ${hi}`);
      return 200;
    }
    return Math.min(hi, Math.max(lo, v));
  };
  const w = dim(spec.w, "w");
  const h = dim(spec.h, "h");
  const ctx: Ctx = { w, h, unit: Math.max(w, h), shapes: 0 };
  if (!Array.isArray(spec.items) || !spec.items.length) return { drawing: null, errors: [...errors, "рисунок: items — непустой список элементов"] };
  const shapes: Shape[] = [];
  spec.items.slice(0, ART_LIMITS.items).forEach((raw, i) => {
    const before = ctx.shapes;
    try {
      shapes.push(...item(raw, ctx, 0));
    } catch (e) {
      ctx.shapes = before;
      errors.push(`элемент ${i + 1}: ${e instanceof ArtError ? e.message : "не собрался"}`);
    }
  });
  if (spec.items.length > ART_LIMITS.items) errors.push(`рисунок: элементов больше ${ART_LIMITS.items} — лишние отброшены`);
  const drawing = sanitizeDrawing({ w, h, shapes });
  if (!drawing) return { drawing: null, errors: [...errors, "рисунок получился пустым"] };
  const overflow = overflowNote(drawing);
  if (overflow) errors.push(overflow);
  return { drawing, errors };
}

/** Рисунок заметно шире холста — модель, скорее всего, ошиблась в координатах. */
function overflowNote(d: Drawing): string | null {
  const box = d.shapes.reduce<{ x0: number; y0: number; x1: number; y1: number } | null>((acc, s) => {
    let b: { x0: number; y0: number; x1: number; y1: number } | null = null;
    if (s.kind === "circle") b = { x0: s.cx - s.r, y0: s.cy - s.r, x1: s.cx + s.r, y1: s.cy + s.r };
    else if (s.kind === "rect") b = { x0: s.x, y0: s.y, x1: s.x + s.w, y1: s.y + s.h };
    else {
      const segs = parsePath(s.d);
      b = segs ? segsBox(segs) : null;
    }
    if (!b) return acc;
    return acc ? { x0: Math.min(acc.x0, b.x0), y0: Math.min(acc.y0, b.y0), x1: Math.max(acc.x1, b.x1), y1: Math.max(acc.y1, b.y1) } : b;
  }, null);
  if (!box) return null;
  const px = d.w * 0.12;
  const py = d.h * 0.12;
  if (box.x0 >= -px && box.y0 >= -py && box.x1 <= d.w + px && box.y1 <= d.h + py) return null;
  const f = (v: number) => Math.round(v);
  return `рисунок выходит за холст ${d.w}×${d.h}: занимает x ${f(box.x0)}…${f(box.x1)}, y ${f(box.y0)}…${f(box.y1)} — держите всё внутри 0…${d.w} и 0…${d.h}`;
}
