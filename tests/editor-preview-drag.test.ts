import { describe, expect, it } from "vitest";
import { anchorAtBlock, insertionHint, MAX_WIDTH, MIN_WIDTH, resizedWidth, resizeFactor } from "@/components/editor/preview/drag";

describe("превью редактора: уголок размера", () => {
  it("фото по центру растёт в обе стороны, прижатое вправо — влево", () => {
    expect(resizeFactor("left")).toBe(1);
    expect(resizeFactor("center")).toBe(2);
    expect(resizeFactor("right")).toBe(-1);
  });

  it("сдвиг уголка в пикселях → ширина в процентах полосы, в пределах 25…100", () => {
    const left = { startWidth: 60, factor: 1 };
    expect(resizedWidth(left, 30, 300)).toBe(70);
    expect(resizedWidth(left, -300, 300)).toBe(MIN_WIDTH);
    expect(resizedWidth(left, 300, 300)).toBe(MAX_WIDTH);
    expect(resizedWidth({ startWidth: 60, factor: 2 }, 15, 300)).toBe(70);
    expect(resizedWidth({ startWidth: 60, factor: -1 }, -30, 300)).toBe(70);
  });
});

describe("превью редактора: куда встанет перетащенное фото", () => {
  const line = { top: 100, height: 20 };

  it("нижняя половина строки — после блока, верхняя — перед ним", () => {
    expect(anchorAtBlock(115, line, { from: 2, to: 2 }, 6)).toBe(2);
    expect(anchorAtBlock(105, line, { from: 2, to: 2 }, 6)).toBe(1);
  });

  it("перед блоком из нескольких абзацев (список, стихи) — перед первым из них", () => {
    expect(anchorAtBlock(105, line, { from: 2, to: 4 }, 6)).toBe(1);
    expect(anchorAtBlock(115, line, { from: 2, to: 4 }, 6)).toBe(4);
  });

  it("перед первым абзацем — −1, после последнего — в конец ответа (null)", () => {
    expect(anchorAtBlock(105, line, { from: 0, to: 0 }, 6)).toBe(-1);
    expect(anchorAtBlock(115, line, { from: 5, to: 5 }, 6)).toBeNull();
  });

  it("подсветка места: линия под блоком с этим абзацем, у первого блока — и над ним", () => {
    expect(insertionHint(2, 6, 2)).toBe("below");
    expect(insertionHint(null, 6, 5)).toBe("below");
    expect(insertionHint(-1, 6, 0)).toBe("above");
    expect(insertionHint(2, 6, 3)).toBeUndefined();
  });
});
