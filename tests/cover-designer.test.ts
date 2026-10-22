import { describe, expect, it } from "vitest";
import { boardSize, parseCoverDesign, safeArea, type CoverDesign, type TextLayer } from "@/lib/book/cover-design";
import { formats } from "@/lib/book/formats";
import {
  addLayer,
  alignBox,
  clampBox,
  copyStyle,
  coverBox,
  designColors,
  duplicateLayer,
  effectiveDpi,
  historyOf,
  moveZ,
  newDecorLayer,
  newImageLayer,
  newShapeLayer,
  newTextLayer,
  pasteStyle,
  record,
  redo,
  reorder,
  resizeBox,
  rotateAngle,
  snapMove,
  snapResize,
  snapTargets,
  undo,
  unsafeTextLayers,
} from "@/components/cover/designer/logic";

const board = boardSize(formats.a5);
const safe = safeArea(formats.a5);
const texts = { title: "Наша история", subtitle: "", names: "Аня & Олжас" };
const text = (id: string, extra: Partial<TextLayer> = {}): TextLayer => ({ id, kind: "text", text: "Привет", x: 0.2, y: 0.3, w: 0.4, h: 0.1, style: { font: "lora", weight: 400, size: 0.05, color: "#000000", align: "center", valign: "middle" }, ...extra });
const doc = (...layers: TextLayer[]): CoverDesign => ({ v: 1, background: { kind: "template" }, layers });

describe("конструктор: история", () => {
  it("отмена и повтор; правки одного жеста — один шаг; ползунок сливается только подряд", () => {
    const a = doc(text("a"));
    const b = doc(text("a", { x: 0.3 }));
    const c = doc(text("a", { x: 0.4 }));
    let h = record(historyOf(a), b, "g:move:a:1", 0);
    h = record(h, c, "g:move:a:1", 99_000);
    expect(h.past).toEqual([a]);
    expect(undo(h).present).toBe(a);
    expect(redo(undo(h)).present).toBe(c);
    let p = record(historyOf(a), b, "p:a:size", 0);
    p = record(p, c, "p:a:size", 500);
    expect(p.past).toHaveLength(1);
    p = record(p, a, "p:a:size", 5000);
    expect(p.past).toHaveLength(2);
    // Новая правка после отмены стирает «вперёд».
    expect(record(undo(h), c, null).future).toEqual([]);
  });
});

describe("конструктор: слои", () => {
  it("дублировать — над оригиналом со сдвигом; привязанный текст становится своим", () => {
    const d = doc(text("a", { bind: "title", text: "" }), text("b"));
    const r = duplicateLayer(d, "a", texts);
    expect(r.design.layers.map((l) => l.id)).toEqual(["a", r.id, "b"]);
    const copy = r.design.layers[1] as TextLayer;
    expect(copy.bind).toBeUndefined();
    expect(copy.text).toBe("Наша история");
    expect(copy.x).toBeCloseTo(0.225, 6);
  });

  it("порядок: на передний план, ниже, перетаскивание", () => {
    const d = doc(text("a"), text("b"), text("c"));
    expect(moveZ(d, "a", "front").layers.map((l) => l.id)).toEqual(["b", "c", "a"]);
    expect(moveZ(d, "c", "down").layers.map((l) => l.id)).toEqual(["a", "c", "b"]);
    expect(moveZ(d, "c", "back").layers.map((l) => l.id)).toEqual(["c", "a", "b"]);
    expect(reorder(d, 0, 2).layers.map((l) => l.id)).toEqual(["b", "c", "a"]);
  });

  it("выравнивание по безопасной зоне и по центру крышки", () => {
    const b = { x: 0.3, y: 0.3, w: 0.2, h: 0.1 };
    expect(alignBox(b, "left", safe).x).toBeCloseTo(safe.x, 4);
    expect(alignBox(b, "right", safe).x).toBeCloseTo(safe.x + safe.w - 0.2, 4);
    expect(alignBox(b, "center", safe).x).toBeCloseTo(0.4, 4);
    expect(alignBox(b, "bottom", safe).y).toBeCloseTo(safe.y + safe.h - 0.1, 4);
  });

  it("новые слои — в безопасной зоне и проходят проверку как есть", () => {
    let d = doc();
    for (const l of [newTextLayer(d, "heading", "Заголовок", safe, "#1F1A17"), newImageLayer(d, { stock: "peony" }, safe, board, 1.5), newShapeLayer(d, "frame", safe, board, "#B8925A"), newDecorLayer(d, "laurel", safe, board, "#B8925A", 1)]) {
      expect(l.x).toBeGreaterThanOrEqual(safe.x - 1e-6);
      expect(l.x + l.w).toBeLessThanOrEqual(safe.x + safe.w + 1e-6);
      d = addLayer(d, l);
    }
    expect(parseCoverDesign(d)).toMatchObject(d);
  });

  it("буфер стиля переносит стиль только на слой того же вида", () => {
    const a = text("a", { style: { ...text("a").style, font: "prata", color: "#7A1F2B", shadow: { color: "#000000", x: 0.04, y: 0.04 } } });
    const b = text("b");
    const pasted = pasteStyle(b, copyStyle(a)) as TextLayer;
    expect(pasted.style.font).toBe("prata");
    expect(pasted.text).toBe(b.text);
    expect(pasted.x).toBe(b.x);
    const shape = newShapeLayer(doc(), "rect", safe, board, "#000000");
    expect(pasteStyle(shape, copyStyle(a))).toBe(shape);
  });
});

describe("конструктор: геометрия жестов", () => {
  it("размер за правую ручку: левая сторона на месте; за угол с Shift — пропорционально", () => {
    const start = { x: 0.2, y: 0.3, w: 0.4, h: 0.1 };
    const r = resizeBox(start, 0, "e", 0.1, 0.5, board, false);
    expect(r.x).toBeCloseTo(0.2, 6);
    expect(r.w).toBeCloseTo(0.5, 6);
    expect(r.h).toBeCloseTo(0.1, 6);
    const k = resizeBox(start, 0, "se", 0.2, 0, board, true);
    expect(k.w / start.w).toBeCloseTo(k.h / start.h, 6);
    expect(k.x).toBeCloseTo(0.2, 6);
    expect(k.y).toBeCloseTo(0.3, 6);
    const w = resizeBox(start, 0, "nw", -0.1, -0.05, board, false);
    expect(w.x + w.w).toBeCloseTo(0.6, 6);
    expect(w.y + w.h).toBeCloseTo(0.4, 6);
  });

  it("повёрнутый слой тянется вдоль своих сторон, противоположная сторона не уезжает", () => {
    const start = { x: 0.3, y: 0.4, w: 0.3, h: 0.1 };
    // Поворот 90°: «правая» сторона слоя смотрит вниз — тянем вниз.
    const r = resizeBox(start, 90, "e", 0, 0.1, board, false);
    expect(r.w * board.w).toBeCloseTo(0.3 * board.w + 0.1 * board.h, 4);
    expect(r.h).toBeCloseTo(0.1, 6);
  });

  it("поворот: Shift — по 15°, рядом с 0/90 — прилипает", () => {
    expect(rotateAngle(0, 0, 37, true)).toBe(30);
    expect(rotateAngle(0, 0, 88, false)).toBe(90);
    expect(rotateAngle(10, 0, 20, false)).toBe(30);
    expect(rotateAngle(170, 0, 30, false)).toBe(-160);
  });

  it("прилипание: к центру крышки и к краю другого слоя, с направляющей", () => {
    const d = doc(text("a", { x: 0.1, y: 0.1, w: 0.3, h: 0.1 }), text("b"));
    const targets = snapTargets(d, "b", safe);
    const m = snapMove({ x: 0.301, y: 0.6, w: 0.4, h: 0.1 }, targets, 0.01, 0.01);
    expect(m.box.x).toBeCloseTo(0.3, 6);
    expect(m.guides.x).toEqual([0.5]);
    const r = snapResize({ x: 0.1, y: 0.25, w: 0.295, h: 0.1 }, "e", targets, 0.01, 0.01);
    expect(r.box.x + r.box.w).toBeCloseTo(0.4, 6);
  });

  it("рамка ограничивается пределами данных; «на всю обложку» — с заходом за край", () => {
    expect(clampBox({ x: -1, y: 2, w: 5, h: 0 })).toEqual({ x: -0.2, y: 1.2, w: 1.4, h: 0.01 });
    const c = coverBox();
    expect(c.x).toBeLessThan(0);
    expect(c.x + c.w).toBeGreaterThan(1);
  });
});

describe("конструктор: подсказки", () => {
  it("текст за безопасной зоной (с учётом поворота) — в предупреждении; пустой привязанный — нет", () => {
    const d = doc(text("in"), text("edge", { x: 0.01 }), text("rot", { x: 0.6, y: 0.4, w: 0.3, h: 0.3, rotate: 45 }), text("empty", { bind: "subtitle", text: "", x: 0 }));
    expect(unsafeTextLayers(d, safe, texts, board).map((l) => l.id)).toEqual(["edge", "rot"]);
  });

  it("разрешение снимка в печати и цвета обложки для образцов", () => {
    expect(effectiveDpi({ width: 3000, height: 2000 }, { w: 127, h: 84.67 })).toBe(600);
    expect(effectiveDpi({ width: 3000, height: 2000 }, { w: 127, h: 84.67 }, 2)).toBe(300);
    expect(designColors(doc(text("a")))).toEqual(["#000000"]);
  });
});
