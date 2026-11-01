/**
 * Фигуры редактора фото: контуры в своей коробке w×h (SVG path). «fill» — замкнутые, их можно залить или обвести;
 * «line» — линии, только обводка. Одни и те же контуры рисует холст (Path2D) и показывают кнопки выбора (SVG).
 */

export const SHAPE_IDS = ["heart", "star", "sparkle", "circle", "square", "arrow", "bubble", "flower", "sun", "crown", "line", "curve", "check", "wave"] as const;
export type ShapeId = (typeof SHAPE_IDS)[number];

export interface ShapeDef {
  path: string;
  w: number;
  h: number;
  kind: "fill" | "line";
}

const f = (n: number) => Math.round(n * 100) / 100;

/** Звезда из n лучей в коробке 100×100. */
function star(n: number, outer: number, inner: number) {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI * i) / n - Math.PI / 2;
    pts.push(`${f(50 + r * Math.cos(a))} ${f(50 + r * Math.sin(a))}`);
  }
  return `M${pts.join(" L")} Z`;
}

/** Цветок из пяти лепестков в коробке 100×100. */
function flower() {
  const dir = (a: number, r: number) => `${f(50 + r * Math.cos(a))} ${f(50 + r * Math.sin(a))}`;
  let d = "";
  for (let i = 0; i < 5; i++) {
    const a = (2 * Math.PI * i) / 5 - Math.PI / 2;
    d += `M50 50 C${dir(a - 0.62, 42)} ${dir(a - 0.3, 56)} ${dir(a, 48)} C${dir(a + 0.3, 56)} ${dir(a + 0.62, 42)} 50 50 Z `;
  }
  return `${d}M50 38 A12 12 0 1 0 50 62 A12 12 0 1 0 50 38 Z`;
}

export const SHAPES: Record<ShapeId, ShapeDef> = {
  heart: {
    path: "M50 90 C22 70 3 52 3 31 C3 15 15 4 29 4 C38 4 46 9 50 18 C54 9 62 4 71 4 C85 4 97 15 97 31 C97 52 78 70 50 90 Z",
    w: 100,
    h: 94,
    kind: "fill",
  },
  star: { path: star(5, 50, 20), w: 100, h: 100, kind: "fill" },
  sparkle: {
    path: "M50 0 C53 33 67 47 100 50 C67 53 53 67 50 100 C47 67 33 53 0 50 C33 47 47 33 50 0 Z",
    w: 100,
    h: 100,
    kind: "fill",
  },
  circle: {
    path: "M0 50 A50 50 0 1 0 100 50 A50 50 0 1 0 0 50 Z",
    w: 100,
    h: 100,
    kind: "fill",
  },
  square: {
    path: "M12 0 H88 Q100 0 100 12 V88 Q100 100 88 100 H12 Q0 100 0 88 V12 Q0 0 12 0 Z",
    w: 100,
    h: 100,
    kind: "fill",
  },
  arrow: {
    path: "M0 17 H62 V0 L100 25 L62 50 V33 H0 Z",
    w: 100,
    h: 50,
    kind: "fill",
  },
  bubble: {
    path: "M14 0 H86 Q100 0 100 14 V54 Q100 68 86 68 H42 L20 88 L25 68 H14 Q0 68 0 54 V14 Q0 0 14 0 Z",
    w: 100,
    h: 88,
    kind: "fill",
  },
  flower: { path: flower(), w: 100, h: 100, kind: "fill" },
  sun: { path: star(12, 50, 36), w: 100, h: 100, kind: "fill" },
  crown: {
    path: "M4 66 L10 10 L30 36 L50 2 L70 36 L90 10 L96 66 Z M4 72 H96 V84 H4 Z",
    w: 100,
    h: 86,
    kind: "fill",
  },
  line: { path: "M2 6 H98", w: 100, h: 12, kind: "line" },
  curve: {
    path: "M6 72 Q36 6 88 26 M70 12 L90 27 L74 44",
    w: 100,
    h: 78,
    kind: "line",
  },
  check: { path: "M6 52 L36 80 L94 14", w: 100, h: 94, kind: "line" },
  wave: {
    path: "M2 12 Q14 2 26 12 T50 12 T74 12 T98 12",
    w: 100,
    h: 24,
    kind: "line",
  },
};
