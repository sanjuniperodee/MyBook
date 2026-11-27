import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/server/site-handlers/media/cover";
import { CoverBackPreview } from "@/book-view/cover/CoverBackPreview";
import { CoverPreview } from "@/book-view/cover/CoverPreview";
import { designBackgroundSvg } from "@/book-view/cover/DesignedCover";
import { designBack } from "@/lib/book/cover-back";
import { designFromTemplate } from "@/lib/book/cover-design";
import { coverMeta } from "@/lib/book/covers/meta";
import { allCoverTemplates, getCoverTemplate, renderCoverSvg, stripLines } from "@/lib/book/covers";
import { coverFrontGeometry, getFormat, type Rect } from "@/lib/book/formats";
import { renderCover } from "@/modules/production/infrastructure/pdf/render";
import type { Book } from "@/shared/infrastructure/db/schema";
import { fixtureBook } from "./fixtures/books";
import { hasTool } from "./pdf-inspect";

// Обращение №17 (24.11.2026): Алёна попросила убрать «полосы» с обложки «Глянец» — линию у имён и линию внизу крышки.
// Нижняя линия — часть рисунка шаблона, в конструкторе её не убрать. Теперь у книги есть настройка «Декоративные
// линии» (books.cover_lines) для всех шаблонов: без неё нет линий и рамок рисунка — на превью, обороте, в 3D-книге, в
// конструкторе и в печати одинаково. Обращение №18: короткую линию под именами Алёна попросила оставить — украшение у
// имён (часть текстового блока) настройка не трогает, его убирают слоем в конструкторе.

const format = getFormat("a5");
const g = coverFrontGeometry(format);
const book = (over: Partial<Book> = {}): Book => ({ ...fixtureBook("classic", "a5", "ru").bundle.book, coverTemplate: "magazine", ...over });

/** Декоративные линии, которые остались в SVG (кроме помеченных data-keep — линии самого рисунка). */
const leftLines = (svg: string) =>
  [...svg.matchAll(/<(line|rect|path|circle|ellipse)\b[^>]*?\/>/g)].filter(([el, tag]) => !/data-keep/.test(el) && (/data-line/.test(el) || tag === "line" || (tag === "rect" && /fill="none"/.test(el) && /stroke="/.test(el))));

describe("декоративные линии обложки (обращение №17)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgres://test/mybook");
    vi.stubEnv("WEB_API_ONLY", "");
    vi.stubEnv("WEB_USE_API_V1", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("все шаблоны: без линий нет ни линий, ни рамок, а места под фото, картинки и прочий рисунок те же", async () => {
    let withLines = 0;
    for (const t of allCoverTemplates) {
      const on: number[] = [];
      const off: number[] = [];
      const a = renderCoverSvg(t, g, { uid: "a", onSlot: (s) => on.push(s.slot) }, { noTexture: true });
      const b = renderCoverSvg(getCoverTemplate(t.id, false), g, { uid: "a", onSlot: (s) => off.push(s.slot) }, { noTexture: true });
      if (leftLines(a).length) withLines++;
      expect(leftLines(b), t.id).toEqual([]);
      expect(off, t.id).toEqual(on);
      // Убраны только самозакрытые элементы: группы, defs и картинки на месте.
      for (const tag of ["<g", "</g>", "<image", "<defs", "<clipPath", "<svg", "</svg>"]) expect(b.split(tag).length, `${t.id} ${tag}`).toBe(a.split(tag).length);
      expect(stripLines(b)).toBe(b);
      // SVG по-прежнему читается (librsvg — как у /api/covers и PDF).
      await sharp(Buffer.from(b), { density: 10 }).png().toBuffer();
    }
    // Линии есть у многих шаблонов — правило не пустое.
    expect(withLines).toBeGreaterThan(15);
  });

  it("«Глянец»: линия внизу уходит, линия под именами (украшение текста) остаётся", () => {
    const on = getCoverTemplate("magazine");
    const off = getCoverTemplate("magazine", false);
    expect(off.ornament).toEqual(on.ornament);
    expect(off.ornament?.kind).toBe("line");
    expect(off.lines).toBe(false);
    expect(getCoverTemplate("magazine", false)).toBe(off);
    expect(renderCoverSvg(on, g, { uid: "m" })).toContain("<line ");
    expect(renderCoverSvg(off, g, { uid: "m" })).not.toContain("<line ");
    for (const t of allCoverTemplates) expect(getCoverTemplate(t.id, false).ornament, t.id).toEqual(t.ornament);
  });

  it("оборот: надписи и украшение у имён те же", () => {
    const content = { layout: "minimal" as const, text: "", signature: "", names: "Алёна & Николай", year: 2026, photos: [] };
    const back = (lines: boolean) => designBack(getCoverTemplate("magazine", lines), 140, 200, content).blocks;
    expect(back(false)).toEqual(back(true));
    expect(back(false).map((b) => b.kind)).toContain("ornament");
  });

  it("превью в кабинете: фон без линий (картинка -nl и встроенный SVG), линия под именами на месте", async () => {
    const html = (lines: boolean, template = "noir", photos?: string[]) =>
      renderToStaticMarkup(createElement(CoverPreview, { template, lines, title: "История нашей любви", names: "Алёна & Николай", photos }));
    const src = /<img src="\/api\/covers\/([^"?]+)/.exec(html(false))![1];
    expect(src).toContain("-nl");
    const res = await GET(new Request(`http://local/api/covers/${src}`), { params: Promise.resolve({ file: src }) });
    const svg = await res.text();
    expect(leftLines(svg)).toEqual([]);
    const withLines = /<img src="\/api\/covers\/([^"?]+)/.exec(html(true))![1];
    expect(withLines).not.toContain("-nl");
    // С фото клиента — встроенный SVG; линия у имён — span шириной 4 кегля украшения (HTML поверх фона).
    const photo = "data:image/png;base64,iVBORw0KGgo=";
    expect(html(true, "magazine", [photo])).toContain("<line ");
    expect(html(false, "magazine", [photo])).not.toContain("<line ");
    expect(html(false, "magazine", [photo])).toContain("* 4)");
    // Текст лица тот же: меняется только фон.
    const text = (h: string) => h.replace(/<svg[\s\S]*<\/svg>/, "");
    expect(text(html(false, "magazine", [photo]))).toBe(text(html(true, "magazine", [photo])));
    // Оборот берёт фон тоже без линий.
    const back = renderToStaticMarkup(createElement(CoverBackPreview, { template: "noir", lines: false, content: { layout: "minimal", text: "", signature: "", names: "А & Н", year: 2026, photos: [] } }));
    expect(back).toMatch(/\/api\/covers\/noir-a5-nl-back/);
  });

  it("конструктор: слои из шаблона те же (линия под именами — слой, его можно удалить), фон «шаблон» — без линий", () => {
    const texts = { title: "История нашей любви", subtitle: "", names: "Алёна & Николай" };
    const design = (lines: boolean) => designFromTemplate(coverMeta(getCoverTemplate("magazine", lines)), texts, format);
    expect(design(false)).toEqual(design(true));
    expect(design(false).layers.map((l) => l.id)).toContain("ornament");
    expect(design(false).background).toEqual({ kind: "template" });
    const bg = (lines: boolean) => designBackgroundSvg("magazine", "a5", design(lines), { uid: "d", lines, photos: ["data:image/png;base64,iVBORw0KGgo="] });
    expect(bg(true)).toContain("<line ");
    expect(bg(false)).not.toContain("<line ");
  });

  it.skipIf(!hasTool("pdftoppm"))("печать: в cover.pdf нет линии внизу крышки, линия под именами на месте — как на превью", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cover-lines-"));
    const raster = async (lines: boolean) => {
      const { pdf, geometry } = await renderCover({ book: book({ coverLines: lines }), questions: [], chapters: [], photos: [] }, 120, "preview", true);
      const file = path.join(dir, `c${lines}.pdf`);
      writeFileSync(file, pdf);
      spawnSync("pdftoppm", ["-r", "200", "-gray", "-png", "-singlefile", file, path.join(dir, `p${lines}`)]);
      const png = readFileSync(path.join(dir, `p${lines}.png`));
      const k = (await sharp(png).metadata()).width! / geometry.width;
      const f = geometry.front;
      // stats() считает по исходной картинке, поэтому кусок сначала вырезается в отдельный буфер.
      const mean = async (r: Rect) => (await sharp(await sharp(png).extract({ left: Math.round(r.x * k), top: Math.round(r.y * k), width: Math.round(r.w * k), height: Math.max(1, Math.round(r.h * k)) }).png().toBuffer()).stats()).channels[0].mean;
      // Нижняя линия: f.y + f.h − 11 мм, от 8 до 92 % ширины — полоса 1 мм вокруг неё против полосы чуть выше.
      const line = { x: f.x + f.w * 0.2, y: f.y + f.h - 11.5, w: f.w * 0.6, h: 1 };
      // Линия у имён — под строкой имён у левого края области текста (~10 % высоты крышки).
      const ornament = { x: f.x + f.w * 0.09, y: f.y + f.h * 0.094, w: f.w * 0.1, h: f.h * 0.01 };
      return { line: await mean(line), above: await mean({ ...line, y: line.y - 3 }), ornament: await mean(ornament), underOrnament: await mean({ ...ornament, y: ornament.y + 4 }) };
    };
    const on = await raster(true);
    const off = await raster(false);
    expect(on.line - on.above).toBeGreaterThan(8);
    expect(Math.abs(off.line - off.above)).toBeLessThan(4);
    expect(Math.abs(on.ornament - off.ornament)).toBeLessThan(1);
    expect(off.ornament - off.underOrnament).toBeGreaterThan(5);
  });
});
