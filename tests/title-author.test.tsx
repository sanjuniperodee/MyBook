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
