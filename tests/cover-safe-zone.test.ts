import { describe, expect, it } from "vitest";
import { allCoverTemplates } from "@/lib/book/covers";
import { coverMeta } from "@/lib/book/covers/meta";
import { boardSize, coverLayouts, designFromTemplate, safeArea } from "@/lib/book/cover-design";
import { templateTextLayout } from "@/lib/book/cover-design/template-text";
import { formats } from "@/lib/book/formats";

// 12.11.2026: типография обрезает обложку по краю крышки, загиб уходит под картон. После перехода на крышку 145×207
// у квадратного формата и у «Полароида» имена стояли в 6–8 мм от края, длинное название выталкивало текст под загиб.
// Текст шаблонов и макетов — всегда внутри безопасной зоны (8 мм от края, 9 мм у корешка).

const long = { title: "Жүрекке жазылған аманат және махаббат туралы кітап", subtitle: "Біздің бірге өткен он жылымыз туралы", names: "Александра & Александр" };
const inside = (r: { x: number; y: number; w: number; h: number }, s: { x: number; y: number; w: number; h: number }) =>
  r.x >= s.x - 1e-6 && r.y >= s.y - 1e-6 && r.x + r.w <= s.x + s.w + 1e-6 && r.y + r.h <= s.y + s.h + 1e-6;

describe("безопасная зона обложки", () => {
  for (const format of Object.values(formats)) {
    const safe = safeArea(format);
    const board = boardSize(format);
    it(`${format.id}: область текста каждого шаблона — внутри зоны, длинное название — мельче`, () => {
      for (const t of allCoverTemplates) {
        const { area, scale } = templateTextLayout(coverMeta(t), long, board);
        expect(inside(area, safe), t.id).toBe(true);
        expect(scale).toBeLessThanOrEqual(1);
        expect(templateTextLayout(coverMeta(t), { title: "Мы", subtitle: "", names: "" }, board).scale, t.id).toBe(1);
        for (const l of designFromTemplate(coverMeta(t), long, format).layers) if (l.kind === "text") expect(l.y + l.h, `${t.id} ${l.id}`).toBeLessThanOrEqual(safe.y + safe.h + 0.02);
      }
    });
    it(`${format.id}: надписи макетов — внутри зоны`, () => {
      for (const l of coverLayouts) {
        const d = l.build({ texts: long, format, photos: [] });
        for (const x of d.layers) if (x.kind === "text" && !x.rotate && !x.hidden) expect(inside(x, safe), `${l.id} ${x.id}`).toBe(true);
      }
    });
  }
});
