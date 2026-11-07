import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DealWorkspace } from "@/app/admin/deals/[id]/DealWorkspace";
import { StageLabel } from "@/app/admin/deals/StageLabel";
import { dealNo, shortDate } from "@/app/admin/deals/ui";

// Редизайн «Тираж», группа сделок и клиентов: короткие подписи и разделы разворота сделки (разметка без браузера).

describe("подписи сделок", () => {
  it("номер сделки — «Д12», дата срока — короткая, с годом только не текущим", () => {
    expect(dealNo(12)).toBe("Д12");
    const now = new Date("2026-11-07T05:00:00Z");
    expect(shortDate(new Date("2026-11-06T07:00:00Z"), now)).toMatch(/^6 нояб/);
    expect(shortDate(new Date("2026-11-06T07:00:00Z"), now)).not.toContain("2026");
    expect(shortDate(new Date("2027-01-15T07:00:00Z"), now)).toContain("2027");
  });

  it("этап — одна точка цвета этапа и подпись, без плашки .badge (у неё в CRM своя точка)", () => {
    const html = renderToStaticMarkup(<StageLabel name="Ждём фото" color="#c08a5b" />);
    expect(html).toContain("Ждём фото");
    expect(html).toContain("background:#c08a5b");
    expect(html).not.toContain("badge");
  });
});

const tab = (key: string, label: string) => ({ key, label, node: <p>{`содержимое ${key}`}</p> });
const left = [tab("overview", "Обзор"), tab("money", "Оплата"), tab("details", "Детали")];
const context = [tab("chat", "Переписка"), tab("history", "История")];

/** Класс панели раздела по её содержимому. */
const panelClass = (html: string, key: string) => html.match(new RegExp(`<div id="deal-panel-${key}"[^>]*class="([^"]*)"`))?.[1] ?? "";

describe("разворот сделки: разделы", () => {
  it("открыт «Обзор»: остальные слева спрятаны, колонка контекста на узких экранах — тоже", () => {
    const html = renderToStaticMarkup(<DealWorkspace left={left} context={context} />);
    expect(panelClass(html, "overview")).not.toContain("hidden");
    expect(panelClass(html, "money")).toContain("hidden");
    expect(panelClass(html, "details")).toContain("hidden");
    expect(html).toMatch(/<aside[^>]*class="[^"]*max-xl:hidden/);
  });

  it("?pay= открывает «Оплату»; раздел контекста (история) показывает колонку справа и прячет левые на узких экранах", () => {
    expect(panelClass(renderToStaticMarkup(<DealWorkspace left={left} context={context} initial="money" />), "money")).not.toMatch(/(^|\s)hidden/);
    const html = renderToStaticMarkup(<DealWorkspace left={left} context={context} initial="history" />);
    expect(panelClass(html, "overview")).toContain("max-xl:hidden");
    expect(html).not.toMatch(/<aside[^>]*class="[^"]*max-xl:hidden/);
    expect(panelClass(html, "history")).toContain("flex");
    expect(panelClass(html, "chat")).toContain("hidden");
  });

  it("все разделы отрисованы сразу — формы не теряют набранное при переключении", () => {
    const html = renderToStaticMarkup(<DealWorkspace left={left} context={context} />);
    for (const k of ["overview", "money", "details", "chat", "history"]) expect(html).toContain(`содержимое ${k}`);
  });
});
