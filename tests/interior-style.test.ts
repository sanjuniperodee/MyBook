import { describe, expect, it } from "vitest";
import { linesOffset } from "@/lib/book/flow-decisions";
import { applyInteriorStyle, bookInterior, chapterDesign, getInteriorDesign, interiorDesigns, parseInteriorStyle } from "@/lib/book/interiors";
import { dropCapPlan, interiorSizes, measureInsets, paraAfter, quoteFace, quoteStyle, splitInitial } from "@/lib/book/typesetting";

describe("настройки дизайнера страниц", () => {
  it("без настроек — тот же объект стиля: книги без дизайнера верстаются как раньше", () => {
    for (const d of interiorDesigns) {
      expect(applyInteriorStyle(d, {})).toBe(d);
      expect(applyInteriorStyle(d, null)).toBe(d);
    }
    expect(bookInterior({ interior: "classic", interiorStyle: {} })).toBe(getInteriorDesign("classic"));
  });

  it("разбор: неизвестное отбрасывается, числа ограничиваются, цвета — #RRGGBB", () => {
    const s = parseInteriorStyle({
      fonts: { body: { font: "ebgaramond", weight: 500 }, heading: { font: "comic-sans" }, nope: { font: "lora" } },
      body: { size: 40, lineHeight: 0.5, indent: 1.5, align: "diagonal", measure: 0.2 },
      colors: { accent: "#a8874b", ink: "red", opener: null },
      elements: { dropCap: "drop", dropLines: 9, divider: "asterism", folio: "none", ornament: "unicorn" },
      chapters: { intro: { accent: "#112233", number: "roman", fill: "#000000" }, "bad key!": { accent: "#000000" } },
      junk: 1,
    });
    expect(s).toEqual({
      fonts: { body: { font: "ebgaramond", weight: 500 } },
      body: { size: 16, lineHeight: 1.1, indent: 1.5, measure: 0.7 },
      colors: { accent: "#A8874B", opener: null },
      elements: { dropCap: "drop", dropLines: 4, divider: "asterism", folio: "none" },
      chapters: { intro: { accent: "#112233", number: "roman", fill: "#000000" } },
    });
    expect(parseInteriorStyle("строка")).toEqual({});
  });

  it("применение: шрифты по ролям, кегль, интервалы, элементы и цвета попадают в дизайн", () => {
    const base = getInteriorDesign("classic");
    const d = applyInteriorStyle(base, {
      fonts: { body: { font: "literata" }, heading: { font: "notodisplay", weight: 600 }, quote: { font: "alice" }, initial: { font: "yeseva" } },
      body: { size: 11, lineHeight: 1.6, indent: 1.2, paraGap: 0, align: "left", measure: 0.8 },
      heading: { upper: true, tracking: 0.1 },
      colors: { accent: "#8B2C3A", paper: "#FBF5E9" },
      elements: { dropCap: "drop", dropLines: 3, number: "none", divider: "space", titlePage: "stack", quote: "mark" },
    });
    expect(d.type).toMatchObject({ body: "literata", bodySize: 11, lineHeight: 1.6 });
    expect(d.text).toMatchObject({ indent: 1.2, paraGap: 0, align: "left", measure: 0.8 });
    expect(d.heading.face).toMatchObject({ font: "notodisplay", weight: 600, upper: true, tracking: 0.1 });
    expect(quoteFace(d)).toMatchObject({ font: "alice", italic: false });
    expect(quoteStyle(d)).toBe("mark");
    expect(d.dropCap).toMatchObject({ style: "drop", lines: 3 });
    expect(d.dropCap?.face?.font).toBe("yeseva");
    expect(d.opener.number).toBe("none");
    expect(d.divider).toBe("space");
    expect(d.titlePage?.layout).toBe("stack");
    expect(d.palette.accent).toBe("#8B2C3A");
    expect(d.paper).toBe("#FBF5E9");
    expect(paraAfter(d)).toBe(0);
    expect(measureInsets(d)).toEqual({ left: 0, right: expect.closeTo(0.2, 6) });
    // Остальное — как в стиле.
    expect(d.ornament).toBe(base.ornament);
    expect(d.label).toMatchObject({ font: base.label.font, size: base.label.size });
  });

  it("буквица снимается и ставится; цветная начальная полоса — со светлым текстом на тёмном", () => {
    const novel = getInteriorDesign("novel");
    expect(novel.dropCap).toBeDefined();
    expect(applyInteriorStyle(novel, { elements: { dropCap: "none" } }).dropCap).toBeUndefined();
    const dark = applyInteriorStyle(getInteriorDesign("classic"), { colors: { opener: "#141414" } });
    expect(dark.opener.fill?.paper).toBe("#141414");
    expect(dark.opener.fill?.ink).toBe("#FBF7F1");
    expect(applyInteriorStyle(getInteriorDesign("stars"), { colors: { opener: null } }).opener.fill).toBeUndefined();
  });

  it("своё оформление главы не трогает остальные главы", () => {
    const d = applyInteriorStyle(getInteriorDesign("classic"), { chapters: { meet: { number: "roman", align: "left", accent: "#123456", dropCap: { style: "raised", lines: 2 } } } });
    expect(chapterDesign(d, "intro")).toBe(d);
    const meet = chapterDesign(d, "meet");
    expect(meet.opener).toMatchObject({ number: "roman", align: "left" });
    expect(meet.palette.accent).toBe("#123456");
    expect(meet.dropCap).toMatchObject({ style: "raised", lines: 2 });
  });
});

describe("буквица", () => {
  it("верх — на высоте прописных первой строки, высота колонки — lines строк", () => {
    const d = getInteriorDesign("novel");
    const S = interiorSizes(d, 1);
    const plan = dropCapPlan(d, S)!;
    expect(plan.style).toBe("drop");
    expect(plan.height).toBeCloseTo(plan.lines * S.body * d.type.lineHeight, 6);
    expect(plan.size).toBeGreaterThan(S.body * 2.5);
    // Буквица не выше колонки: базовая линия — на последней строке рядом с ней.
    expect(plan.top + plan.size * plan.lineHeight).toBeLessThan(plan.height);
  });

  it("буквица только у абзаца с буквы или цифры", () => {
    expect(splitInitial("Мы встретились")).toEqual(["М", "ы встретились"]);
    expect(splitInitial("— Привет")).toBeNull();
    expect(splitInitial("«Цитата»")).toBeNull();
  });

  it("место продолжения: знаки строк, без дефиса переноса, капитель в верхнем регистре", () => {
    const text = "ы встретились весной, когда в городе цвели яблони. Это было";
    expect(linesOffset(text, ["Ы ВСТРЕТИЛИСЬ весной, ", "когда в го-", "роде цвели"], 2)).toBe("ы встретились весной, когда в го".length);
    expect(linesOffset(text, ["совсем другой текст"], 1)).toBeNull();
  });
});
