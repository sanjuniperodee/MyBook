/**
 * Шаблон → обложка из слоёв: название, подзаголовок, орнамент и имена шаблона становятся отдельными слоями на тех же
 * местах, что в PDF (textArea — доли крышки, кегль — доля её ширины). Высоты строк оцениваются по средней ширине
 * знаков шрифта; дальше клиент двигает и меняет слои как хочет — шаблон только отправная точка.
 */
import type { CoverMeta } from "../covers/meta";
import type { CoverTextStyle } from "../covers/types";
import type { BookFormat } from "../formats";
import { boardSize } from "./geometry";
import { parseCoverDesign } from "./parse";
import { styleTextHeight, TEMPLATE_GAP, templateTextLayout } from "./template-text";
import type { CoverDesign, CoverLayer, CoverTexts, TextLayer } from "./types";

const GAP = TEMPLATE_GAP;

const styleOf = (s: CoverTextStyle, align: "left" | "center" | "right", scale: number): TextLayer["style"] => ({
  font: s.font,
  weight: s.weight ?? 400,
  ...(s.italic ? { italic: true } : {}),
  ...(s.upper ? { upper: true } : {}),
  size: Math.round(s.size * scale * 10000) / 10000,
  color: s.color,
  ...(s.tracking ? { tracking: s.tracking } : {}),
  lineHeight: s.lineHeight ?? 1.2,
  align,
  valign: "top",
});

export function designFromTemplate(template: CoverMeta, texts: CoverTexts, format: BookFormat): CoverDesign {
  const { w: W, h: H } = boardSize(format);
  // Область и кегли — как у текста шаблона в превью и PDF: внутри безопасной зоны, длинное название — мельче.
  const { area: ta, scale } = templateTextLayout(template, texts, { w: W, h: H });
  const textHeight = (text: string, st: CoverTextStyle, widthMm: number, w: number) => styleTextHeight(text, st, st.size * scale, widthMm, w);
  const align = template.align ?? "center";
  const width = ta.w * W;
  type Item = { kind: "title" | "subtitle" | "names" | "ornament" | "spacer"; h: number; gap: number };
  const items: Item[] = [];
  const ornament = template.ornament && texts.names.trim() ? template.ornament : null;
  const ornamentItem: Item = ornament ? { kind: "ornament", h: ornament.kind === "line" ? 0.3 : GAP.ornamentSize * W, gap: GAP.ornament * W } : { kind: "spacer", h: GAP.spacer * W, gap: 0 };
  const title: Item = { kind: "title", h: textHeight(texts.title || "…", template.title, width, W), gap: 0 };
  const subtitle: Item | null = texts.subtitle.trim() ? { kind: "subtitle", h: textHeight(texts.subtitle, template.subtitle, width, W), gap: GAP.subtitle * W } : null;
  const names: Item | null = texts.names.trim() ? { kind: "names", h: textHeight(texts.names, template.names, width, W), gap: 0 } : null;
  if (template.namesFirst) items.push(...(names ? [names] : []), ornamentItem, title, ...(subtitle ? [subtitle] : []));
  else items.push(title, ...(subtitle ? [subtitle] : []), ornamentItem, ...(names ? [names] : []));

  const total = items.reduce((sum, it) => sum + it.h + it.gap * (it.kind === "ornament" ? 2 : 1), 0);
  const area = { y: ta.y * H, h: ta.h * H };
  let y = template.justify === "start" ? area.y : template.justify === "end" ? area.y + area.h - total : area.y + (area.h - total) / 2;

  const layers: CoverLayer[] = [];
  for (const it of items) {
    if (it.kind === "ornament" && ornament) {
      y += it.gap;
      const size = GAP.ornamentSize * W;
      const ow = ornament.kind === "line" ? size * 4 : ornament.kind === "dots" ? size * 1.6 : size;
      const x = align === "left" ? ta.x * W : align === "right" ? (ta.x + ta.w) * W - ow : (ta.x + ta.w / 2) * W - ow / 2;
      layers.push(
        ornament.kind === "line"
          ? { id: "ornament", kind: "shape", shape: "line", x: x / W, y: (y - 0.6) / H, w: ow / W, h: 1.5 / H, stroke: ornament.color, strokeWidth: 0.0015 }
          : { id: "ornament", kind: "decor", motif: ornament.kind === "heart" ? "heart" : ornament.kind === "star" ? "sparkle" : "dots", color: ornament.color, x: x / W, y: y / H, w: ow / W, h: it.h / H },
      );
      y += it.h + it.gap;
      continue;
    }
    if (it.kind === "spacer") {
      y += it.h;
      continue;
    }
    y += it.gap;
    const style = it.kind === "title" ? template.title : it.kind === "subtitle" ? template.subtitle : template.names;
    // Небольшой запас по высоте: браузер и PDF могут перенести строку чуть иначе, чем оценка.
    const slack = style.size * scale * W * 0.25;
    const bind = it.kind as "title" | "subtitle" | "names";
    layers.push({ id: bind, kind: "text", bind, text: "", x: ta.x, y: y / H, w: ta.w, h: (it.h + slack) / H, style: styleOf(style, align, scale) });
    y += it.h;
  }
  // Через разбор: числа округлены так же, как при сохранении — данные в редакторе и в базе совпадают.
  return parseCoverDesign({ v: 1, background: { kind: "template" }, layers })!;
}
