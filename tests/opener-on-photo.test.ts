import { describe, expect, it } from "vitest";
import { formats } from "@/lib/book/formats";
import { applyInteriorStyle, chapterDesign, getInteriorDesign, parseInteriorStyle } from "@/lib/book/interiors";
import { OPENER_ON_PHOTO, openerPhotoPlan, openerTextColors } from "@/lib/book/photo-pages";

// Название главы на снимке во всю полосу («Кадр»): светлое, даже если заливку главы убрали в дизайнере.
// У клиентки (книга 1acd566a) у главы intro заливка снята — название стало тёмным по затемнённому фото.

describe("цвета названия на начальной полосе со снимком", () => {
  const cinema = getInteriorDesign("cinema");
  const shot = openerPhotoPlan(formats.a5, cinema);

  it("каталог: заливка «Кадра» со светлым текстом — её цвета", () => {
    expect(shot?.shade).toBeTruthy();
    expect(openerTextColors(cinema, shot).ink).toBe(cinema.opener.fill!.ink);
  });

  it("заливку главы убрали в дизайнере, текст книги тёмный — по снимку всё равно светлое", () => {
    const styled = applyInteriorStyle(cinema, parseInteriorStyle({ colors: { ink: "#1F1A17" }, chapters: { intro: { fill: null } } }));
    const intro = chapterDesign(styled, "intro");
    expect(intro.opener.fill).toBeUndefined();
    expect(openerTextColors(intro, openerPhotoPlan(formats.a5, intro))).toEqual(OPENER_ON_PHOTO);
  });

  it("светлая заливка главы (её текст тёмный) — по снимку тоже светлое", () => {
    const styled = applyInteriorStyle(cinema, parseInteriorStyle({ chapters: { intro: { fill: "#F5EFE6" } } }));
    const intro = chapterDesign(styled, "intro");
    expect(openerTextColors(intro, openerPhotoPlan(formats.a5, intro))).toEqual(OPENER_ON_PHOTO);
  });

  it("без снимка (глава без фото) — как раньше: заливка или цвета книги", () => {
    const styled = applyInteriorStyle(cinema, parseInteriorStyle({ colors: { ink: "#1F1A17" }, chapters: { intro: { fill: null } } }));
    const intro = chapterDesign(styled, "intro");
    expect(openerTextColors(intro, null).ink).toBe("#1F1A17");
    expect(openerTextColors(cinema, null)).toBe(cinema.opener.fill);
  });

  it("снимок без затемнения (под обрез сверху, текст на бумаге) — цвета заливки или книги", () => {
    const photobook = getInteriorDesign("photobook");
    const plan = openerPhotoPlan(formats.a5, photobook);
    expect(plan?.shade).toBeUndefined();
    expect(openerTextColors(photobook, plan)).toBe(photobook.opener.fill ?? photobook.palette);
  });
});
