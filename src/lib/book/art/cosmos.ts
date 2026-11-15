/**
 * Объём и мягкий свет: свечение (glow), туманность (nebula), шар со светом и тенью (sphere), планета с атмосферой и
 * кольцом (planet), орбиты-эллипсы и «бесконечность» (orbit), сияющая звезда (sparkle), мягкая форма по точкам (blob).
 * Мягкость — градиенты с прозрачностью (Shape.grad): один круг даёт ореол без ступеней, HTML и PDF рисуют одинаково.
 */
import { n, rng } from "../covers/svg-kit";
import type { Grad, GradStop, Shape } from "../interior-art";
import { ArtError, Fields, type Pt } from "./kit";

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Плавный спад от центра к краю: несколько точек остановки по smoothstep — без видимой границы. */
function falloff(color: string, max: number, from = 0): GradStop[] {
  const out: GradStop[] = [];
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const u = from + (1 - from) * t;
    out.push([r3(u), color, r3(max * (1 - t * t * (3 - 2 * t)))]);
  }
  return out;
}

const radial = (stops: GradStop[], fx?: number, fy?: number): Grad => ({ type: "radial", cx: 0.5, cy: 0.5, r: 0.5, ...(fx !== undefined && fy !== undefined ? { fx: r3(fx), fy: r3(fy) } : {}), stops });

/** Круг с радиальным градиентом (fill — запасной цвет для мест без градиентов). */
const softCircle = (cx: number, cy: number, r: number, color: string, grad: Grad, opacity?: number): Shape => ({ kind: "circle", cx: n(cx), cy: n(cy), r: n(r), fill: color, grad, ...(opacity !== undefined && opacity < 1 ? { opacity } : {}) });

const paintOr = (f: Fields, k: string, def: string) => f.paint(k) ?? def;

/** Свечение: мягкий ореол вокруг точки — звезда, луна, свет за названием, огонёк. */
function glow(f: Fields): Shape[] {
  const color = paintOr(f, "fill", "accent");
  return [softCircle(f.num("cx"), f.num("cy"), f.num("r", undefined, 0.5), color, radial(falloff(color, f.num("opacity", 0.7, 0.05, 1))))];
}

/** Туманность: облака из мягких кругов двух цветов в прямоугольнике — объём неба вместо плоских овалов. */
function nebula(f: Fields): Shape[] {
  const { ctx } = f;
  const x = f.num("x", 0);
  const y = f.num("y", 0);
  const w = f.num("w", ctx.w, 4);
  const h = f.num("h", ctx.h, 4);
  const clouds = f.int("clouds", 5, 1, 10);
  const max = f.num("opacity", 0.4, 0.05, 0.9);
  const colors = [paintOr(f, "fill", "main"), paintOr(f, "accent", "accent")];
  const rand = rng(f.int("seed", 1, 0, 9999) * 131 + 7);
  const out: Shape[] = [];
  for (let i = 0; i < clouds; i++) {
    // Облако — гряда из нескольких клубов вдоль случайного направления, к краям клубы меньше.
    const cx = x + w * (0.2 + rand() * 0.6);
    const cy = y + h * (0.2 + rand() * 0.6);
    const ang = rand() * Math.PI;
    const len = Math.min(w, h) * (0.35 + rand() * 0.45);
    const puffs = 4 + Math.floor(rand() * 3);
    const color = colors[i % 2];
    for (let k = 0; k < puffs; k++) {
      const t = k / (puffs - 1) - 0.5;
      const r = len * (0.32 - Math.abs(t) * 0.28) * (0.8 + rand() * 0.4);
      // Клуб не выходит за прямоугольник туманности: центр сдвигается внутрь.
      const clampIn = (v: number, lo: number, hi: number) => (hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
      const px = clampIn(cx + Math.cos(ang) * len * t + (rand() - 0.5) * r * 0.6, x + r, x + w - r);
      const py = clampIn(cy + Math.sin(ang) * len * t + (rand() - 0.5) * r * 0.6, y + r, y + h - r);
      out.push(softCircle(px, py, r, color, radial(falloff(color, max * (0.5 + rand() * 0.5)))));
    }
  }
  return out;
}

/** Направление света: угол в градусах, 0 — сверху, по часовой. */
function lightDir(f: Fields, def: number) {
  const a = (f.num("light", def, -360, 360) * Math.PI) / 180;
  return { x: Math.sin(a), y: -Math.cos(a), a };
}

/**
 * Шар: диск цвета base, тень с противоположной от света стороны и блик со стороны света — три круга, всё внутри
 * диска. Основа планеты, жемчужины, ёлочного шара, мяча, ягоды.
 */
function sphereShapes(cx: number, cy: number, r: number, base: string, light: string, shadow: string, dir: { x: number; y: number }, bright: number, dark: number): Shape[] {
  return [
    { kind: "circle", cx: n(cx), cy: n(cy), r: n(r), fill: base },
    // Тень: прозрачная у света, густеет к противоположному краю (фокус — со стороны света).
    softCircle(cx, cy, r, shadow, radial([[0, shadow, 0], [0.45, shadow, r3(dark * 0.15)], [0.8, shadow, r3(dark * 0.7)], [1, shadow, dark]], 0.5 + dir.x * 0.45, 0.5 + dir.y * 0.45)),
    // Блик: яркое пятно у света, тает к середине.
    softCircle(cx, cy, r, light, { type: "radial", cx: r3(0.5 + dir.x * 0.32), cy: r3(0.5 + dir.y * 0.32), r: 0.62, fx: r3(0.5 + dir.x * 0.38), fy: r3(0.5 + dir.y * 0.38), stops: [[0, light, bright], [0.35, light, r3(bright * 0.55)], [0.75, light, r3(bright * 0.12)], [1, light, 0]] }),
  ];
}

function sphere(f: Fields): Shape[] {
  const dir = lightDir(f, 315);
  return sphereShapes(f.num("cx"), f.num("cy"), f.num("r", undefined, 0.5), paintOr(f, "fill", "main"), paintOr(f, "accent", "#FFFFFF"), paintOr(f, "shadow", "#000000"), dir, f.num("bright", 0.85, 0, 1), f.num("dark", 0.8, 0, 1));
}

/**
 * Планета: шар плюс атмосфера-ореол, ободок света по краю и, по желанию, кольцо — задняя половина под планетой,
 * передняя над ней; ring: true или {size, tilt, rot, color}.
 */
function planet(f: Fields): Shape[] {
  const cx = f.num("cx");
  const cy = f.num("cy");
  const r = f.num("r", undefined, 1);
  const base = paintOr(f, "fill", "main");
  const light = paintOr(f, "accent", "accent");
  const shadow = paintOr(f, "shadow", "#000000");
  const dir = lightDir(f, 315);
  const out: Shape[] = [];
  const ringOn = f.o.ring === true || (typeof f.o.ring === "object" && f.o.ring !== null && !Array.isArray(f.o.ring));
  const ro = (ringOn && typeof f.o.ring === "object" ? f.o.ring : {}) as Record<string, unknown>;
  const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const rrx = r * num(ro.size, 1.9, 1.2, 3);
  const rry = rrx * num(ro.tilt, 0.24, 0.05, 0.9);
  const rrot = num(ro.rot, -18, -90, 90);
  const ringColor = typeof ro.color === "string" && /^#[0-9a-fA-F]{6}$|^main$|^accent$/.test(ro.color) ? (ro.color.startsWith("#") ? ro.color.toUpperCase() : ro.color) : light;
  const half = (front: boolean): Shape[] => {
    const t = (rrot * Math.PI) / 180;
    return ([[1, 0.6, 0.035], [0.88, 0.35, 0.06], [0.76, 0.2, 0.03]] as const).map(([k, op, wd]) => ({
      kind: "path" as const,
      d: `M${n(cx - Math.cos(t) * rrx * k)},${n(cy - Math.sin(t) * rrx * k)} A${n(rrx * k)},${n(rry * k)} ${n(rrot)} 0 ${front ? 0 : 1} ${n(cx + Math.cos(t) * rrx * k)},${n(cy + Math.sin(t) * rrx * k)}`,
      stroke: ringColor,
      width: n(r * wd),
      opacity: op,
    }));
  };
  if (ringOn) out.push(...half(false));
  // Атмосфера: светящееся кольцо вокруг диска.
  if (f.o.atmosphere !== false) {
    const haze = f.num("haze", 0.45, 0, 1);
    out.push(softCircle(cx, cy, r * 1.3, light, radial([[0, light, 0], [0.7, light, 0], [0.77, light, r3(haze)], [0.86, light, r3(haze * 0.35)], [1, light, 0]])));
  }
  out.push(...sphereShapes(cx, cy, r, base, light, shadow, dir, f.num("bright", 0.8, 0, 1), f.num("dark", 0.85, 0, 1)));
  // Ободок света по краю со стороны источника.
  const p = (d: number) => ({ x: cx + Math.sin(dir.a + d) * r * 0.985, y: cy - Math.cos(dir.a + d) * r * 0.985 });
  const [p0, p1] = [p(-1.1), p(1.1)];
  out.push({ kind: "path", d: `M${n(p0.x)},${n(p0.y)} A${n(r * 0.985)},${n(r * 0.985)} 0 0 1 ${n(p1.x)},${n(p1.y)}`, stroke: light, width: n(Math.max(0.15, r * 0.03)), opacity: 0.75, round: true });
  if (ringOn) out.push(...half(true));
  return out;
}

/** Замкнутая плавная кривая через точки; r — округление. */
function closedSmooth(pts: Pt[], r: (v: number) => number = (v) => Math.round(v * 10) / 10): string {
  const m = pts.length;
  let d = `M${r(pts[0].x)},${r(pts[0].y)}`;
  for (let i = 0; i < m; i++) {
    const p0 = pts[(i + m - 1) % m];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % m];
    const p3 = pts[(i + 2) % m];
    d += `C${r(p1.x + (p2.x - p0.x) / 6)},${r(p1.y + (p2.y - p0.y) / 6)} ${r(p2.x - (p3.x - p1.x) / 6)},${r(p2.y - (p3.y - p1.y) / 6)} ${r(p2.x)},${r(p2.y)}`;
  }
  return `${d}Z`;
}

/**
 * Орбита: гладкий эллипс или «бесконечность» (лемниската Бернулли) с центром cx,cy, полуосями rx,ry и поворотом rot
 * (градусы, по часовой). Концы петель бесконечности — в точках (cx ± rx, cy) до поворота: туда ставят планеты.
 */
function orbit(f: Fields): Shape[] {
  const cx = f.num("cx");
  const cy = f.num("cy");
  const rx = f.num("rx", undefined, 1);
  const ry = f.num("ry", rx * 0.4, 0.5);
  const rot = (f.num("rot", 0, -360, 360) * Math.PI) / 180;
  const kind = f.str("kind", ["ellipse", "infinity"] as const, "ellipse");
  const st = f.open(f.ctx.unit * 0.003);
  const N = 72;
  const pts: Pt[] = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const s = kind === "ellipse" ? 1 : 1 + Math.sin(t) ** 2;
    const x = (rx * Math.cos(t)) / s;
    const y = kind === "ellipse" ? ry * Math.sin(t) : (ry * Math.sin(t) * Math.cos(t)) / s / 0.3536;
    pts.push({ x: cx + x * Math.cos(rot) - y * Math.sin(rot), y: cy + x * Math.sin(rot) + y * Math.cos(rot) });
  }
  return [{ kind: "path", d: closedSmooth(pts), stroke: st.stroke ?? "main", width: st.width, ...(st.opacity !== undefined ? { opacity: st.opacity } : {}), round: true }];
}

/** Сияющая звезда: четыре длинных луча (и четыре коротких при rays 8), белое ядро и мягкий ореол. */
function sparkle(f: Fields): Shape[] {
  const cx = f.num("cx");
  const cy = f.num("cy");
  const r = f.num("r", undefined, 0.5);
  const rays = f.int("rays", 4, 4, 8);
  if (rays !== 4 && rays !== 8) throw new ArtError("sparkle: rays — 4 или 8");
  const fill = paintOr(f, "fill", "accent");
  const star = (len: number, turn: number) => {
    const k = len * 0.1;
    const pts = [0, 1, 2, 3].flatMap((i) => {
      const a = turn + (i * Math.PI) / 2;
      const b = a + Math.PI / 4;
      return [`${n(cx + Math.sin(a) * len)},${n(cy - Math.cos(a) * len)}`, `${n(cx + Math.sin(b) * k)},${n(cy - Math.cos(b) * k)}`];
    });
    return `M${pts[0]} Q${pts[1]} ${pts[2]} Q${pts[3]} ${pts[4]} Q${pts[5]} ${pts[6]} Q${pts[7]} ${pts[0]}Z`;
  };
  const out: Shape[] = [];
  if (f.o.glow !== false) out.push(softCircle(cx, cy, r * 1.6, fill, radial(falloff(fill, f.num("opacity", 0.75, 0.05, 1)))));
  if (rays === 8) out.push({ kind: "path", d: star(r * 0.55, Math.PI / 4), fill, opacity: 0.8 });
  out.push({ kind: "path", d: star(r, 0), fill });
  out.push(softCircle(cx, cy, r * 0.28, "#FFFFFF", radial(falloff("#FFFFFF", 1, 0.2))));
  return out;
}

/** Мягкая форма по точкам: замкнутая плавная кривая — лепесток, облако, холм, капля, пятно краски; с grad — объём. */
function blob(f: Fields): Shape[] {
  const raw = f.o.points;
  if (!Array.isArray(raw) || raw.length < 3 || raw.length > 40) throw new ArtError("blob: points — список из 3–40 точек [x, y] по контуру");
  const pts = raw.map((p, i) => {
    if (!Array.isArray(p) || p.length !== 2 || !p.every((v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 5000)) throw new ArtError(`blob: points[${i}] — точка [x, y]`);
    return { x: p[0] as number, y: p[1] as number };
  });
  const st = f.closed();
  const d = closedSmooth(pts, n);
  return [{ kind: "path", d, ...(st.fill ? { fill: st.fill } : {}), ...(st.fill && st.grad ? { grad: st.grad } : {}), ...(st.stroke ? { stroke: st.stroke, width: st.width } : {}), ...(st.opacity !== undefined ? { opacity: st.opacity } : {}) }];
}

export const COSMOS = ["glow", "nebula", "sphere", "planet", "orbit", "sparkle", "blob"] as const;
export const COSMOS_BUILDERS: Record<(typeof COSMOS)[number], (f: Fields) => Shape[]> = { glow, nebula, sphere, planet, orbit, sparkle, blob };
