import { describe, expect, it } from "vitest";
import { bookShift, clampPos, leafCount, leafPages, pageLeaf, pagesNear, settle, sheetCount, visibleSpread } from "@/lib/book/flipbook";

// Листы 3D-книги — полосы экранной сборки (того же PDF, что для типографии) по две: своей раскладки у книги нет.

describe("листы из полос сборки", () => {
  it("печатный объём — листы по две полосы между обложкой и задней крышкой", () => {
    expect([leafCount(24), sheetCount(24)]).toEqual([12, 14]);
    expect([leafCount(196), sheetCount(196)]).toEqual([98, 100]);
    // Нечётного объёма в печати нет; если бы был — последняя полоса легла бы на лицо листа без пары.
    expect(leafCount(25)).toBe(13);
    expect(leafCount(0)).toBe(1);
  });

  it("лицо листа i — полоса 2i−1, оборот — 2i; каждая полоса ровно на одной стороне", () => {
    expect(leafPages(1)).toEqual({ front: 1, back: 2 });
    expect(leafPages(12)).toEqual({ front: 23, back: 24 });
    for (let n = 1; n <= 24; n++) {
      const { leaf, side } = pageLeaf(n);
      expect(side === "f" ? leafPages(leaf).front : leafPages(leaf).back).toBe(n);
    }
  });

  it("visibleSpread: слева — оборот предыдущего листа, справа — лицо текущего; у обложек — форзацы", () => {
    const sheets = sheetCount(24);
    const last = sheets - 1;
    for (let r = 2; r < last; r++) expect(visibleSpread(r, sheets)).toEqual({ left: leafPages(r - 1).back, right: leafPages(r).front });
    expect(visibleSpread(0, sheets)).toEqual({ left: null, right: null });
    expect(visibleSpread(1, sheets)).toEqual({ left: null, right: 1 });
    expect(visibleSpread(last, sheets)).toEqual({ left: 24, right: null });
  });
});

describe("pagesNear: какие полосы держать загруженными", () => {
  it("сначала видимый разворот, потом следующий, предыдущий, через один", () => {
    expect(pagesNear(5, 24, 2)).toEqual([8, 9, 10, 11, 6, 7, 12, 13, 4, 5]);
    expect(pagesNear(5, 24, 0)).toEqual([8, 9]);
  });

  it("закрытая книга готовит первые полосы — открыть её можно сразу", () => {
    expect(pagesNear(0, 24, 2)).toEqual([1, 2, 3]);
  });

  it("у задней обложки — только последние полосы; за концом книги ничего", () => {
    const last = sheetCount(24) - 1;
    expect(pagesNear(last, 24, 2)).toEqual([24, 22, 23, 20, 21]);
  });

  it("без повторов и только полосы книги — в любой позиции; не больше двух полос на разворот окна", () => {
    for (const pageCount of [24, 28, 196])
      for (let slot = 0; slot < sheetCount(pageCount); slot++) {
        const near = pagesNear(slot, pageCount, 2);
        expect(new Set(near).size).toBe(near.length);
        expect(near.every((n) => n >= 1 && n <= pageCount)).toBe(true);
        expect(near.length).toBeLessThanOrEqual(10);
        const { left, right } = visibleSpread(slot, sheetCount(pageCount));
        expect(near.slice(0, [left, right].filter(Boolean).length)).toEqual([left, right].filter(Boolean));
      }
  });
});

describe("положение и жесты", () => {
  it("закрытая книга лежит по центру: сдвиг ±½ страницы и 0 на развороте", () => {
    expect(bookShift(0, 10)).toBe(-0.5);
    expect(bookShift(1, 10)).toBe(0);
    expect(bookShift(5, 10)).toBe(0);
    expect(bookShift(9, 10)).toBe(0.5);
    expect(bookShift(0.5, 10)).toBe(-0.25);
  });

  it("clampPos держит позицию в пределах листов", () => {
    expect(clampPos(-3, 6)).toBe(0);
    expect(clampPos(9, 6)).toBe(5);
  });

  it("settle: далеко потянули — перевернули, чуть — вернули, быстрый щелчок — перевернули", () => {
    expect(settle(2, 2.6, 0, 8)).toBe(3);
    expect(settle(2, 1.6, 0, 8)).toBe(1);
    expect(settle(2, 2.1, 0, 8)).toBe(2);
    expect(settle(2, 2.1, 0.002, 8)).toBe(3);
    expect(settle(2, 1.9, -0.002, 8)).toBe(1);
    expect(settle(0, -0.8, 0, 8)).toBe(0);
    expect(settle(7, 7.9, 0, 8)).toBe(7);
  });
});
