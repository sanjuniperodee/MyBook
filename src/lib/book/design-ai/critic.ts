/**
 * Критик ИИ-дизайнера: проверки качества, которых нет в разборе (разбор отвечает за «допустимо», критик — за «хорошо»).
 * Нечитаемое название, мелкий заголовок рядом с подзаголовком, четыре шрифта на обложке, текст поверх фото без
 * подложки, рукописный шрифт в основном тексте. Замечания уходят модели в круг исправления, как и ошибки операций.
 */
import { getCoverTemplate } from "../covers";
import { layerText, type CoverDesign, type CoverLayer, type CoverTexts, type TextLayer } from "../cover-design";
import { fontFaces, type FontKey } from "../fonts";
import { applyInteriorStyle, getInteriorDesign } from "../interiors";
import type { CoverState, PagesState } from "./ops";

/** Относительная яркость по WCAG 2: каналы sRGB линеаризуются. */
function relativeLuminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Контраст двух цветов по WCAG 2 (1–21). */
export function contrastRatio(a: string, b: string) {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Цвета фона под текстом: свой цвет, оба края градиента или основной цвет рисунка шаблона. */
function backgroundColors(design: CoverDesign, template: string): string[] {
  const bg = design.background;
  if (bg.kind === "color") return [bg.color];
  if (bg.kind === "gradient") return [bg.from, bg.to];
  const swatch = /#[0-9a-fA-F]{6}/.exec(getCoverTemplate(template).swatch)?.[0];
  return swatch ? [swatch] : [];
}

const overlap = (a: CoverLayer, b: CoverLayer) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? (w * h) / Math.max(1e-6, a.w * a.h) : 0;
};

/** Сплошная подложка под текстом: фигура с заливкой ниже слоя, закрывающая его. */
function solidUnder(design: CoverDesign, i: number, text: TextLayer): string | null {
  for (let j = i - 1; j >= 0; j--) {
    const l = design.layers[j];
    if (l.hidden) continue;
    if (overlap(text, l) < 0.85) continue;
    if (l.kind === "shape" && l.fill && HEX.test(l.fill) && (l.opacity ?? 1) > 0.8 && l.shape !== "line" && l.shape !== "frame" && l.shape !== "corners" && l.shape !== "double") return l.fill;
    if (l.kind === "image") return "image";
  }
  return null;
}

/** Замечания по обложке. */
/** Замечание критика: code — что именно (для сравнения «до» и «после»), text — для модели. */
export interface Advice {
  code: string;
  text: string;
}

export function critiqueCover(state: CoverState, texts?: CoverTexts): Advice[] {
  const out: Advice[] = [];
  const push = (code: string, text: string) => out.push({ code, text });
  const { design } = state;
  const shown = design.layers.map((l, i) => ({ l, i })).filter(({ l }) => !l.hidden && (l.opacity ?? 1) > 0.05);
  const textLayers = shown.filter((x): x is { l: TextLayer; i: number } => x.l.kind === "text" && (!texts || !!layerText(x.l, texts).trim()));
  const title = textLayers.find(({ l }) => l.bind === "title");
  if (!title && texts?.title.trim()) push("no-title", "на обложке не видно названия книги — верните слой с bind \"title\"");
  const bgs = backgroundColors(design, state.template);
  for (const { l, i } of textLayers) {
    const s = l.style;
    const decorated = !!s.plate || !!s.outline || !!s.shadow;
    const under = solidUnder(design, i, l);
    if (under === "image") {
      if (!decorated && l.bind === "title") push(`on-photo:${l.id}`, `название (слой ${l.id}) лежит на фото без подложки, контура или тени — может потеряться; добавьте style.plate или style.shadow либо перенесите на спокойное место`);
      continue;
    }
    const behind = s.plate ? [s.plate.color] : under ? [under] : bgs;
    if (!behind.length) continue;
    const ratio = Math.min(...behind.map((c) => contrastRatio(s.color, c)));
    const need = l.bind === "title" ? 3 : s.size >= 0.05 ? 3 : 4.5;
    if (ratio < need) push(`contrast:${l.id}`, `текст слоя ${l.id} (${s.color}) плохо читается на фоне ${behind.join("/")}: контраст ${ratio.toFixed(1)}, нужно не меньше ${need}`);
  }
  if (title) {
    if (title.l.style.size < 0.05) push("title-small", `название мелковато (size ${title.l.style.size}) — на обложке ему нужно хотя бы 0.06–0.08`);
    const bigger = textLayers.find(({ l }) => l.bind !== "title" && l.style.size > title.l.style.size * 0.95);
    if (bigger) push(`hierarchy:${bigger.l.id}`, `слой ${bigger.l.id} не меньше названия — сделайте название главным (больше остальных текстов)`);
  }
  // Свой рисунок поверх названия (выше по порядку слоёв, заметный, закрывает заметную часть текста) — название теряется.
  if (title) {
    for (const { l, i } of shown) {
      if (l.kind !== "decor" || l.motif !== "art" || i < title.i || (l.opacity ?? 1) < 0.45) continue;
      if (overlap(title.l, l) > 0.25) push(`art-over-title:${l.id}`, `рисунок ${l.id} лежит поверх названия и закрывает его — поставьте рисунок под текст (move_layer back) или уберите с названия`);
    }
  }
  const arts = shown.filter(({ l }) => l.kind === "decor" && l.motif === "art").length;
  if (arts > 5) push("art-many", `своих рисунков на обложке ${arts} — оставьте 2–3: один главный и один-два акцента`);
  const families = new Set(textLayers.map(({ l }) => fontFaces[l.style.font as FontKey]?.family ?? l.style.font));
  if (families.size > 3) push("fonts", `на обложке ${families.size} разных шрифта — оставьте 2, максимум 3`);
  if (shown.length > 14) push("crowded", `слоёв ${shown.length} — обложка перегружена, уберите лишнее`);
  return out;
}

/** Замечания по оформлению страниц. */
export function critiquePages(state: PagesState): Advice[] {
  const out: Advice[] = [];
  const push = (code: string, text: string) => out.push({ code, text });
  const d = applyInteriorStyle(getInteriorDesign(state.interior), state.style);
  const paper = d.paper ?? "#FFFFFF";
  const body = fontFaces[d.type.body as FontKey];
  if (body && !body.body) push("body-font", `основной текст набран шрифтом ${d.type.body} — он только для заголовков; возьмите книжный или без засечек`);
  if (d.type.bodySize < 9.5) push("body-small", `основной текст ${d.type.bodySize} pt — мелко для печати, нужно 10–12`);
  if (d.type.bodySize > 13.5 && d.type.lineHeight < 1.3) push("leading", "крупный кегль с плотным интерлиньяжем — поднимите body.lineHeight до 1.35–1.5");
  if (contrastRatio(d.palette.muted, paper) < 3) push("muted", `подписи (colors.muted ${d.palette.muted}) почти не видны на бумаге ${paper}`);
  if (contrastRatio(d.palette.accent, paper) < 2.2) push("accent", `акцент ${d.palette.accent} теряется на бумаге ${paper}`);
  const families = new Set(Object.values(state.style.fonts ?? {}).map((f) => (f && typeof f === "object" && "font" in f ? String(f.font) : "")).filter(Boolean));
  if (families.size > 3) push("fonts", `в книге ${families.size} своих шрифта — оставьте 2–3`);
  return out;
}

/** Замечания, которых не было до правки: старые недочёты — не повод переделывать то, о чём не просили. */
export const newAdvice = (before: Advice[], after: Advice[]) => after.filter((a) => !before.some((b) => b.code === a.code)).map((a) => a.text);
