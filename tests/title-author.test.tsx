import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { pageKit } from "@/components/interior/kit";
import { TitlePage } from "@/components/interior/pages";
import { pxUnits } from "@/components/interior/units";
import { MessagesContext } from "@/i18n/context";
import { ru } from "@/i18n/messages/ru";
import { formats } from "@/lib/book/formats";
import { applyInteriorStyle, getInteriorDesign, parseInteriorStyle } from "@/lib/book/interiors";
import { applyPagesOps } from "@/lib/book/design-ai";
import { titleLineText } from "@/lib/book/title-line";

/** Имя автора на титульном листе: по умолчанию есть; клиент может убрать («пусть будет пусто»), не трогая имя на обложке. */

const titleHtml = (style: unknown) => {
  const design = applyInteriorStyle(getInteriorDesign("classic"), parseInteriorStyle(style));
  const kit = pageKit(design, formats.a5, pxUnits(400), "ru");
  return renderToStaticMarkup(createElement(MessagesContext.Provider, { value: ru }, createElement(TitlePage, { kit, title: "История нашей любви", subtitle: "", author: "Фаришта", year: 2026 })));
};

describe("имя автора на титульном листе", () => {
  it("по умолчанию стоит; elements.titleAuthor = false убирает его, название и год остаются", () => {
    expect(titleHtml({})).toContain("Фаришта");
    const hidden = titleHtml({ elements: { titleAuthor: false } });
    expect(hidden).not.toContain("Фаришта");
    expect(hidden).toContain("История нашей любви");
    expect(hidden).toContain("2026");
    expect(titleHtml({ elements: { titleAuthor: true } })).toContain("Фаришта");
  });

  it("настройка разбирается и применяется: только булево, раскладка титула не сбрасывается", () => {
    expect(parseInteriorStyle({ elements: { titleAuthor: "нет" } }).elements?.titleAuthor).toBeUndefined();
    const design = applyInteriorStyle(getInteriorDesign("classic"), parseInteriorStyle({ elements: { titleAuthor: false, titlePage: "left" } }));
    expect(design.titlePage).toMatchObject({ layout: "left", author: false });
    expect(applyInteriorStyle(getInteriorDesign("classic"), {}).titlePage?.author).toBeUndefined();
  });

  it("ИИ-дизайнер умеет убрать имя: set elements.titleAuthor", () => {
    const { state, errors } = applyPagesOps({ interior: "classic", style: {} }, [{ op: "set", path: "elements.titleAuthor", value: "false" }]);
    expect(errors).toEqual([]);
    expect(state.style.elements?.titleAuthor).toBe(false);
  });
});

describe("свой текст на титульном листе вместо имени автора", () => {
  it("строка вместо имени: показывается всегда, даже если имя убрано; название и год остаются", () => {
    const own = titleHtml({ elements: { titleLine: "Для любимой мамы" } });
    expect(own).toContain("Для любимой мамы");
    expect(own).not.toContain("Фаришта");
    const hiddenName = titleHtml({ elements: { titleAuthor: false, titleLine: "Алматы, 2026" } });
    expect(hiddenName).toContain("Алматы, 2026");
    expect(hiddenName).not.toContain("Фаришта");
    expect(hiddenName).toContain("История нашей любви");
    // Без своего текста — как раньше.
    expect(titleHtml({ elements: { titleLine: "   " } })).toContain("Фаришта");
  });

  it("разбор: одна строка, пробелы сжаты, не длиннее 80 знаков; пустое и не строка — нет настройки; эмодзи не печатаются", () => {
    const line = (v: unknown) => parseInteriorStyle({ elements: { titleLine: v } }).elements?.titleLine;
    expect(line("  Для   любимой\nмамы ")).toBe("Для любимой мамы");
    expect(line("я".repeat(200))).toHaveLength(80);
    expect(line("")).toBeUndefined();
    expect(line(42)).toBeUndefined();
    const design = applyInteriorStyle(getInteriorDesign("classic"), parseInteriorStyle({ elements: { titleLine: "Маме 💐 с любовью" } }));
    expect(design.titlePage?.line).toBe("Маме 💐 с любовью");
    expect(titleLineText(design, "Фаришта")).toBe("Маме с любовью");
    expect(titleLineText(applyInteriorStyle(getInteriorDesign("classic"), {}), "Фаришта")).toBe("Фаришта");
  });

  it("ИИ-дизайнер умеет вписать строку: set elements.titleLine", () => {
    const { state, errors } = applyPagesOps({ interior: "classic", style: {} }, [{ op: "set", path: "elements.titleLine", value: JSON.stringify("Для любимой мамы") }]);
    expect(errors).toEqual([]);
    expect(state.style.elements?.titleLine).toBe("Для любимой мамы");
  });
});
