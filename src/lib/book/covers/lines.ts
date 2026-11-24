/**
 * Обложка без декоративных линий (books.cover_lines = false): у шаблона не рисуются линии и рамки рисунка и
 * украшение-линия у имён. Фото, затемнения, рисунки и текст остаются как есть.
 *
 * Что такое «линия» в рисунке шаблона — одно правило для всех шаблонов (и новых тоже), без правки каждого:
 * - `<line>` — отрезки-разделители, линии под названием и внизу крышки;
 * - `<rect fill="none" stroke>` — рамки и тонкие обводки окон под фото;
 * - всё, что помечено `data-line=""` (кольцо вокруг фото, контур арки, вторая тонкая обводка медальона и т. п.);
 * - кроме помеченного `data-keep=""`: линии, из которых сложен сам рисунок (лучи веера «Ар-деко»).
 */
import type { CoverTemplate } from "./types";

const ELEMENT = /<(line|rect|path|circle|ellipse|polyline)\b([^>]*?)\/>/g;

function isLine(tag: string, attrs: string) {
  if (/\sdata-keep\b/.test(attrs)) return false;
  if (/\sdata-line\b/.test(attrs)) return true;
  if (tag === "line") return true;
  return tag === "rect" && /\sfill="none"/.test(attrs) && /\sstroke="/.test(attrs);
}

/** SVG рисунка без декоративных линий. */
export function stripLines(svg: string): string {
  return svg.replace(ELEMENT, (el, tag: string, attrs: string) => (isLine(tag, attrs) ? "" : el));
}

const plain = new WeakMap<CoverTemplate, CoverTemplate>();

/**
 * Тот же шаблон без декоративных линий: рисунок без линий и рамок, украшение у имён — без линии (сердце, звезда,
 * точки остаются). id тот же; lines: false — по нему адрес фона (/api/covers/…-nl) и оборот без линии у имён.
 */
export function withoutLines(template: CoverTemplate): CoverTemplate {
  if (template.lines === false) return template;
  let out = plain.get(template);
  if (!out) {
    const art = template.art;
    out = {
      ...template,
      lines: false,
      art: (g, ctx) => stripLines(art(g, ctx)),
      ornament: template.ornament?.kind === "line" ? undefined : template.ornament,
    };
    plain.set(template, out);
  }
  return out;
}
