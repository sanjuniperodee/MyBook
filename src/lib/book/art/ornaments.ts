/**
 * Тонкая графика «как в хорошем издательстве»: линии и узоры без мультяшности — топографические линии, розетка-гильош,
 * веер тонких лучей, вложенные арки, лавровый венок из узких листьев, разделитель с ромбом. Рисуются тонкой линией в
 * один-два цвета, поэтому сочетаются с любым настроением и не спорят с названием.
 */
import { n, rng } from "../covers/svg-kit";
import type { Shape } from "../interior-art";
import { leaf } from "../interior-art/geometry";
import { circleShape, Fields, onCircle, poly, shape, smooth, type Pt, type Style } from "./kit";

const thin = (f: Fields, k = 0.0035) => f.open(f.ctx.unit * k);

/** Топографические линии: «flow» — волнистые линии по полосе, «island» — вложенные контуры острова вокруг центра. */
function contour(f: Fields): Shape[] {
  const { ctx } = f;
  const kind = f.str("kind", ["flow", "island"] as const, "flow");
  const st = thin(f);
  const rand = rng(f.int("seed", 1, 0, 9999) * 211 + 17);
  const lines = f.int("lines", kind === "flow" ? 10 : 7, 2, 24);
  if (kind === "flow") {
    const x = f.num("x", 0);
    const y = f.num("y", 0);
    const w = f.num("w", ctx.w, 10);
    const h = f.num("h", ctx.h * 0.3, 5);
    const amp = f.num("amp", h / lines, 0.1);
    const steps = 9;
    const a1 = 0.6 + rand() * 0.8;
    const a2 = rand() * Math.PI * 2;
    const d: string[] = [];
    for (let i = 0; i < lines; i++) {
      const base = y + (h * i) / (lines - 1);
      const pts: Pt[] = [];
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        pts.push({ x: x + w * t, y: base + amp * (Math.sin(t * Math.PI * 2 * a1 + a2 + i * 0.35) * 0.9 + Math.sin(t * Math.PI * 5 + i * 0.7) * 0.25 + (rand() - 0.5) * 0.2) });
      }
      d.push(smooth(pts));
    }
    return [shape(d.join(" "), st)];
  }
  const cx = f.num("cx", ctx.w / 2);
  const cy = f.num("cy", ctx.h / 2);
  const r = f.num("r", ctx.unit * 0.3, 2);
  const wobble = Array.from({ length: 9 }, () => 0.8 + rand() * 0.4);
  const d: string[] = [];
  for (let i = 1; i <= lines; i++) {
    const k = i / lines;
    const pts: Pt[] = wobble.map((m, j) => {
      const a = (360 * j) / wobble.length;
      return onCircle(cx, cy, r * k * (1 + (m - 1) * (0.4 + 0.6 * k)), a);
    });
    d.push(closedSmooth(pts));
  }
  return [shape(d.join(" "), st)];
}

/** Замкнутая плавная кривая через точки. */
function closedSmooth(pts: Pt[]): string {
  const m = pts.length;
  let d = `M${n(pts[0].x)},${n(pts[0].y)}`;
  for (let i = 0; i < m; i++) {
    const p0 = pts[(i + m - 1) % m];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % m];
    const p3 = pts[(i + 2) % m];
    d += ` C${n(p1.x + (p2.x - p0.x) / 6)},${n(p1.y + (p2.y - p0.y) / 6)} ${n(p2.x - (p3.x - p1.x) / 6)},${n(p2.y - (p3.y - p1.y) / 6)} ${n(p2.x)},${n(p2.y)}`;
  }
  return `${d}Z`;
}

/** Розетка-гильош: гипотрохоида, несколько повёрнутых слоёв — тонкое кружево для эмблемы, медальона, центра обложки. */
function guilloche(f: Fields): Shape[] {
  const cx = f.num("cx");
  const cy = f.num("cy");
  const r = f.num("r", undefined, 2);
  const petals = f.int("petals", 8, 3, 24);
  const layers = f.int("layers", 3, 1, 4);
  const depth = f.num("depth", 0.9, 0.2, 1.6);
  const st = thin(f, 0.0028);
  const k = 1 / petals;
  const d: string[] = [];
  const samples = 220;
  for (let l = 0; l < layers; l++) {
    const spin = (Math.PI / petals) * (l / layers) * 2;
    const pts: string[] = [];
    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * Math.PI * 2;
      const x = (1 - k) * Math.cos(t) + depth * k * Math.cos(((1 - k) / k) * t);
      const y = (1 - k) * Math.sin(t) - depth * k * Math.sin(((1 - k) / k) * t);
      const c = Math.cos(spin);
      const s = Math.sin(spin);
      const norm = 1 - k + depth * k;
      pts.push(`${n(cx + ((x * c - y * s) / norm) * r)},${n(cy + ((x * s + y * c) / norm) * r)}`);
    }
    d.push(`M${pts.join(" L")}Z`);
  }
  const out: Shape[] = [shape(d.join(" "), st)];
  if (f.o.ring !== false) out.push(circleShape(cx, cy, r * 1.04, { ...st, fill: null, stroke: st.stroke ?? "main", width: n(st.width * 1.4) }));
  return out;
}

/** Веер тонких лучей из точки (арт-деко, «солнце»): count линий от inner до r в секторе from…to. */
function fan(f: Fields): Shape[] {
  const cx = f.num("cx");
  const cy = f.num("cy");
  const r = f.num("r", undefined, 2);
  const inner = f.num("inner", r * 0.25, 0, r);
  const from = f.num("from", -90, -720, 720);
  const to = f.num("to", 90, -720, 720);
  const count = f.int("count", 24, 3, 90);
  const st = thin(f, 0.0025);
  const d: string[] = [];
  for (let i = 0; i < count; i++) {
    const a = from + ((to - from) * i) / Math.max(1, count - (Math.abs(to - from) >= 360 ? 0 : 1));
    const p = onCircle(cx, cy, inner, a);
    const q = onCircle(cx, cy, r, a);
    d.push(`M${n(p.x)},${n(p.y)} L${n(q.x)},${n(q.y)}`);
  }
  return [shape(d.join(" "), st)];
}

/** Вложенные арки (окно, портал): count контуров, каждый меньше предыдущего на gap. */
function arches(f: Fields): Shape[] {
  const cx = f.num("cx");
  const y = f.num("y");
  const w = f.num("w", undefined, 4);
  const h = f.num("h", undefined, 4);
  const count = f.int("count", 3, 1, 8);
  const gap = f.num("gap", w * 0.06, 0.2);
  const st = thin(f, 0.0035);
  const d: string[] = [];
  for (let i = 0; i < count; i++) {
    const half = w / 2 - i * gap;
    const top = y + i * gap;
    const bottom = y + h;
    if (half < 2 || bottom - top < half) break;
    d.push(`M${n(cx - half)},${n(bottom)} L${n(cx - half)},${n(top + half)} A${n(half)},${n(half)} 0 0 1 ${n(cx + half)},${n(top + half)} L${n(cx + half)},${n(bottom)}`);
  }
  return [shape(d.join(" "), st)];
}

/** Лавровый венок из узких листьев: две ветви снизу вверх, наверху просвет open (градусы). */
function wreath(f: Fields): Shape[] {
  const cx = f.num("cx");
  const cy = f.num("cy");
  const r = f.num("r", undefined, 4);
  const leaves = f.int("leaves", 12, 4, 24);
  const open = f.num("open", 50, 0, 160);
  const st = f.closed();
  const stem: Style = { ...st, fill: null, stroke: st.fill ?? st.stroke ?? "main", width: n(f.ctx.unit * 0.003), round: true };
  const span = 180 - open / 2;
  const blades: string[] = [];
  const arcs: string[] = [];
  // Правая ветвь идёт от низа вверх против часовой стрелки, левая — по часовой; листья смотрят вперёд по ходу ветви.
  for (const side of [1, -1] as const) {
    const phi = (t: number) => (side === 1 ? 180 - span * t : 180 + span * t);
    const s = onCircle(cx, cy, r, phi(0));
    const e = onCircle(cx, cy, r, phi(1));
    arcs.push(`M${n(s.x)},${n(s.y)} A${n(r)},${n(r)} 0 0 ${side === 1 ? 0 : 1} ${n(e.x)},${n(e.y)}`);
    for (let i = 1; i <= leaves; i++) {
      const t = (i - 0.4) / leaves;
      const p = onCircle(cx, cy, r, phi(t));
      const travel = side === 1 ? phi(t) - 180 : phi(t);
      const len = r * (0.27 - 0.09 * t);
      blades.push(leaf(p.x, p.y, len, travel + 34, 0.24), leaf(p.x, p.y, len * 0.9, travel - 34, 0.24));
    }
  }
  return [shape(arcs.join(" "), stem), shape(blades.join(" "), { ...st, stroke: null })];
}

/** Разделитель: линия с просветом и украшением посередине — diamond, dots, dot. */
function divider(f: Fields): Shape[] {
  const cx = f.num("cx");
  const cy = f.num("cy");
  const w = f.num("w", undefined, 8);
  const kind = f.str("kind", ["diamond", "dots", "dot"] as const, "diamond");
  const st = thin(f, 0.003);
  const gap = Math.min(w * 0.12, f.ctx.unit * 0.04) + (kind === "dots" ? w * 0.04 : 0);
  const out: Shape[] = [shape(`M${n(cx - w / 2)},${n(cy)} L${n(cx - gap)},${n(cy)} M${n(cx + gap)},${n(cy)} L${n(cx + w / 2)},${n(cy)}`, st)];
  const fill: Style = { ...st, fill: st.stroke ?? "main", stroke: null };
  const s = gap * 0.55;
  if (kind === "diamond") out.push(shape(poly([{ x: cx, y: cy - s }, { x: cx + s, y: cy }, { x: cx, y: cy + s }, { x: cx - s, y: cy }]), fill));
  else if (kind === "dot") out.push(circleShape(cx, cy, s * 0.6, fill));
  else for (const dx of [-0.7, 0, 0.7]) out.push(circleShape(cx + dx * gap, cy, s * 0.28, fill));
  return out;
}

export const ORNAMENTS = ["contour", "guilloche", "fan", "arches", "wreath", "divider"] as const;
export const ORNAMENT_BUILDERS: Record<(typeof ORNAMENTS)[number], (f: Fields) => Shape[]> = { contour, guilloche, fan, arches, wreath, divider };
