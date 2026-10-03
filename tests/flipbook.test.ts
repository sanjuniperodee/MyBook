import { describe, expect, it } from "vitest";
import { bookShift, clampPos, planFaces, planSheets, settle, visibleSpread } from "@/lib/book/flipbook";

describe("planFaces", () => {
  it("идёт в порядке PDF: титул, оборот, посвящение, оглавление, главы, финал", () => {
    const { faces } = planFaces({ hasDedication: true, hasToc: true, textPages: [2] });
    expect(faces.map((f) => f.kind)).toEqual(["title", "blank", "dedication", "toc", "opener", "text", "text", "end"]);
  });

  it("начальная полоса главы всегда правая (нечётный номер)", () => {
    for (const hasDedication of [true, false])
      for (const hasToc of [true, false]) {
        const { faces, chapterStarts } = planFaces({ hasDedication, hasToc, textPages: [1, 2, 3, 1] });
        chapterStarts.forEach((no) => {
          expect(no % 2).toBe(1);
          expect(faces[no - 1].kind).toBe("opener");
        });
      }
  });

  it("оглавление не рисуется без глав, глава без текста — одна начальная полоса", () => {
    expect(planFaces({ hasDedication: false, hasToc: true, textPages: [] }).faces.some((f) => f.kind === "toc")).toBe(false);
    const { faces } = planFaces({ hasDedication: false, hasToc: false, textPages: [0, 1] });
    expect(faces.filter((f) => f.kind === "opener")).toHaveLength(2);
    expect(faces.filter((f) => f.kind === "text")).toHaveLength(1);
  });

  it("число полос чётное, последняя — «Конец» либо пустая пара к ней", () => {
    for (const n of [0, 1, 2, 5]) {
      const { faces } = planFaces({ hasDedication: n % 2 === 0, hasToc: false, textPages: Array.from({ length: n }, () => 1) });
      expect(faces.length % 2).toBe(0);
      expect(faces.map((f) => f.kind)).toContain("end");
    }
  });
});

describe("planSheets", () => {
  it("обложка, листы по две полосы, задняя обложка", () => {
    const { faces } = planFaces({ hasDedication: false, hasToc: false, textPages: [1] });
    const sheets = planSheets(faces);
    expect(sheets[0].kind).toBe("cover");
    expect(sheets.at(-1)?.kind).toBe("back");
    expect(sheets).toHaveLength(faces.length / 2 + 2);
    const pages = sheets.filter((s) => s.kind === "pages");
    expect(pages.map((s) => (s.kind === "pages" ? [s.frontNo, s.backNo] : []))[0]).toEqual([1, 2]);
  });

  it("visibleSpread согласуется с номерами на листах", () => {
    const sheets = planSheets(planFaces({ hasDedication: true, hasToc: true, textPages: [2, 2] }).faces);
    const last = sheets.length - 1;
    for (let r = 1; r < last; r++) {
      const left = sheets[r - 1];
      const right = sheets[r];
      const v = visibleSpread(r, sheets.length);
      expect(v.left).toBe(left.kind === "pages" ? left.backNo : null);
      expect(v.right).toBe(right.kind === "pages" ? right.frontNo : null);
    }
    expect(visibleSpread(0, sheets.length)).toEqual({ left: null, right: null });
    expect(visibleSpread(last, sheets.length).right).toBeNull();
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
