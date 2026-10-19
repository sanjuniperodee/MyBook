/**
 * Шаблоны обложек. Графика генерируется в SVG (единицы — миллиметры), поэтому одна и та же
 * функция рисует и превью на сайте, и развёртку для типографии в 300 dpi.
 * Текст (название, имена) накладывается поверх: HTML на сайте и векторный текст в PDF.
 */
import { activeCustomCovers, customCover } from "../cover-registry";
import type { CoverGeometry, Rect } from "../formats";
import { classicTemplates, linen } from "./classic";
import { clientPhotoOrder, clientPhotoTemplates } from "./client-photo";
import { collectionTemplates } from "./collection";
import { photoCollection } from "./photo";
import { grainFilter, linenFilter, n, type ArtContext } from "./svg-kit";
import type { CoverTemplate } from "./types";

export type { ArtContext } from "./svg-kit";
export { coverMoods, type CoverMood, type CoverTemplate, type CoverTextContent, type CoverTextStyle } from "./types";

const builtIn = [...classicTemplates, ...collectionTemplates, ...photoCollection, ...clientPhotoTemplates];
const byId: Record<string, CoverTemplate> = Object.fromEntries(builtIn.map((t) => [t.id, t]));

/**
 * Рисованные обложки, у которых есть замена на снимке: из выбора убраны, но книги с ними
 * по-прежнему открываются и печатаются как раньше.
 */
const retired = new Set(["blossom", "sage", "terracotta", "noir", "hearts", "ocean", "terrazzo", "script", "tulips", "mountains"]);
for (const id of retired) byId[id] = { ...byId[id], hidden: true };

/** Все встроенные обложки, включая убранные из выбора. */
export const allCoverTemplates: CoverTemplate[] = builtIn.map((t) => byId[t.id]);

/**
 * Встроенные обложки в порядке выбора: сначала на готовых снимках (чередуем настроения), затем
 * с фото клиента, затем рисованные.
 */
export const coverTemplates: CoverTemplate[] = [
  "peony", "sakura", "alatau", "tenderness", "velvet", "eucalyptus", "milkyway", "flax", "roses", "clouds", "saddle", "lavender",
  "dusk", "marble", "bouquet", "mist", "lights", "dried", "peaks", "party", "postcards", "meadow", "surf", "autumn", "steppe", "mint",
  ...clientPhotoOrder, "photo",
  "oyu", "constellation", "linen", "sunrise", "midnight", "herbarium", "deco", "leather", "letter", "lemons",
].map((id) => byId[id]);

/** Что видит клиент в выборе: опубликованные шаблоны из CRM, затем встроенные. */
export function pickerCovers(): CoverTemplate[] {
  const custom = activeCustomCovers();
  return custom.length ? [...custom, ...coverTemplates] : coverTemplates;
}

/** Сколько фото клиента нужно обложке: 0 — обложка без фото клиента. */
export function coverPhotoSlots(template: CoverTemplate) {
  return template.requiresPhoto ? Math.max(1, template.photoSlots ?? 1) : 0;
}

/** Фото лицевой стороны по местам шаблона: основное (coverPhotoId) и остальные; пустое место — null. */
export function coverPhotoIds(book: { coverTemplate: string; coverPhotoId: string | null; coverPhotoExtra?: string[] | null }): (string | null)[] {
  const slots = coverPhotoSlots(getCoverTemplate(book.coverTemplate));
  const ids = [book.coverPhotoId, ...(book.coverPhotoExtra ?? [])];
  return Array.from({ length: slots }, (_, i) => ids[i] ?? null);
}

export function getCoverTemplate(id: string): CoverTemplate {
  return byId[id] ?? customCover(id) ?? linen;
}

/** Шаблон существует (встроенный — даже убранный из выбора — или из CRM). */
export function isKnownCover(id: string): boolean {
  return id in byId || !!customCover(id);
}

/** Название обложки на языке страницы: встроенные — из словаря, из CRM — своё. */
export function coverLabel(template: CoverTemplate, names: Record<string, string>, locale: string): string {
  return names[template.id] ?? template.name?.[locale as "ru" | "kk"] ?? template.name?.ru ?? template.id;
}

/**
 * Задняя крышка повторяет композицию лица — плашку, рамку, марку: тот же рисунок, построенный так,
 * будто лицо — это задняя крышка, и обрезанный по ней. Узоры во весь холст совпадают и стыкуются
 * без шва, а свои рисунки задней крышки шаблона этим слоем закрываются.
 */
function backMirror(template: CoverTemplate, g: CoverGeometry, ctx: ArtContext): string {
  if (!g.back || !template.back.mirror) return "";
  const b = g.back;
  const id = `${ctx.uid}bk`;
  const art = template.art({ width: g.width, height: g.height, front: b }, { uid: id, layer: "decor" });
  return `<clipPath id="${id}c"><rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}"/></clipPath><g clip-path="url(#${id}c)">${art}</g>`;
}

export function renderCoverSvg(
  template: CoverTemplate,
  g: CoverGeometry,
  ctx: ArtContext,
  /** plainBack — оборот без повтора композиции лица (под карточками «Полароидов»). */
  opts: { pxPerMm?: number; noTexture?: boolean; plainBack?: boolean } = {},
): string {
  let texture = "";
  if (template.texture && !opts.noTexture) {
    const id = `${ctx.uid}tx`;
    const filter = template.texture.kind === "linen" ? linenFilter(id) : grainFilter(id);
    texture = `<defs>${filter}</defs><rect x="0" y="0" width="${n(g.width)}" height="${n(g.height)}" filter="url(#${id})" opacity="${template.texture.opacity}"/>`;
  }
  const size = opts.pxPerMm
    ? ` width="${Math.round(g.width * opts.pxPerMm)}" height="${Math.round(g.height * opts.pxPerMm)}"`
    : ` preserveAspectRatio="xMidYMid slice"`;
  // Пустые места под фото — снимками-примерами, если вызывающий умеет их загрузить (sampleHref).
  const art = template.samples && ctx.sampleHref && !ctx.samples ? { ...ctx, samples: template.samples.map(ctx.sampleHref) } : ctx;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${n(g.width)} ${n(g.height)}"${size}>${template.art(g, art)}${opts.plainBack ? "" : backMirror(template, g, ctx)}${texture}</svg>`;
}

/**
 * Обрезает развёртку обложки до нужной стороны, чтобы браузер растрировал только её.
 * Фильтры фактуры заданы как «100% области просмотра» — после обрезки это размер стороны, а не развёртки,
 * и фактура пропадает на куске справа и снизу, поэтому размер области фильтра задаётся явно.
 */
export function cropSvg(svg: string, r: Rect, spread: { w: number; h: number }) {
  return svg
    .replace(/viewBox="[^"]*"/, `viewBox="${r.x} ${r.y} ${r.w} ${r.h}"`)
    .replace(/preserveAspectRatio="[^"]*"/, 'preserveAspectRatio="none"')
    .replace(/(<filter [^>]*?)width="100%" height="100%"/g, `$1width="${spread.w}" height="${spread.h}"`);
}

