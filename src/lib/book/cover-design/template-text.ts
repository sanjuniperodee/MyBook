/**
 * Текст шаблона на лице обложки — где и каким кеглем, одним расчётом для превью (CoverText), PDF (CoverDocument) и
 * перевода шаблона в слои конструктора (designFromTemplate): область текста шаблона прижимается внутрь безопасной
 * зоны крышки (у края — под загиб уходит, у корешка — канавка шарнира), а если название, подзаголовок и имена в неё
 * не помещаются, все кегли уменьшаются вместе. Так у длинного названия и у квадратного формата текст не уходит под загиб.
 */
import type { CoverTextStyle } from "../covers/types";
import type { CoverMeta } from "../covers/meta";
import { countLinesEm } from "../word-fit";
import type { Rect } from "../formats";
import { COVER_SAFE } from "./geometry";
import type { CoverTexts } from "./types";

/** Отбивки блока текста шаблона — как в CoverText и CoverDocument: доли ширины крышки. */
export const TEMPLATE_GAP = { subtitle: 0.015, ornament: 0.03, ornamentSize: 0.035, spacer: 0.035 } as const;
/** Не мельче этой доли кегля шаблона: дальше текст всё же выходит из области (пусть лучше крупно, чем мелко). */
const MIN_SCALE = 0.55;
/** Запас: браузер и PDF переносят строки чуть иначе, чем оценка по средней ширине знака. */
const SLACK = 0.92;

/** Высота строки (или нескольких) текста стилем s при кегле size (доля ширины крышки W), мм. */
export function styleTextHeight(text: string, s: CoverTextStyle, size: number, widthMm: number, W: number) {
  // Строки — по ширинам знаков шрифта (как подбор кегля по длинному слову), с разрядкой и прописными.
  const px = size * W;
  return countLinesEm(text || " ", s, widthMm / px) * px * (s.lineHeight ?? 1.2);
}

/** Область текста шаблона внутри безопасной зоны лица крышки W×H мм (доли). Не шире и не выше самой зоны. */
export function safeTextArea(ta: Rect, board: { w: number; h: number }): Rect {
  const x0 = COVER_SAFE.hinge / board.w;
  const x1 = 1 - COVER_SAFE.edge / board.w;
  const y0 = COVER_SAFE.edge / board.h;
  const y1 = 1 - COVER_SAFE.edge / board.h;
  const w = Math.min(ta.w, x1 - x0);
  const h = Math.min(ta.h, y1 - y0);
  const x = Math.min(Math.max(ta.x, x0), x1 - w);
  const y = Math.min(Math.max(ta.y, y0), y1 - h);
  return { x, y, w, h };
}

/** Высота блока текста шаблона при общем масштабе кеглей scale, мм. */
function blockHeight(template: CoverMeta, texts: CoverTexts, scale: number, widthMm: number, W: number) {
  const names = texts.names.trim();
  let h = styleTextHeight(texts.title || "…", template.title, template.title.size * scale, widthMm, W);
  if (texts.subtitle.trim()) h += TEMPLATE_GAP.subtitle * W + styleTextHeight(texts.subtitle, template.subtitle, template.subtitle.size * scale, widthMm, W);
  if (template.ornament && names) h += (TEMPLATE_GAP.ornament * 2 + TEMPLATE_GAP.ornamentSize) * W;
  else h += TEMPLATE_GAP.spacer * W;
  if (names) h += styleTextHeight(names, template.names, template.names.size * scale, widthMm, W);
  return h;
}

/**
 * Где и каким кеглем текст шаблона на лице крышки board (мм): область — в безопасной зоне, scale — общий множитель
 * кеглей (1 — как задумано в шаблоне), чтобы весь текст поместился в область.
 */
export function templateTextLayout(template: CoverMeta, texts: CoverTexts, board: { w: number; h: number }): { area: Rect; scale: number } {
  const area = safeTextArea(template.textArea, board);
  const widthMm = area.w * board.w;
  const limit = area.h * board.h * SLACK;
  let scale = 1;
  while (scale > MIN_SCALE && blockHeight(template, texts, scale, widthMm, board.w) > limit) scale = Math.round((scale - 0.02) * 100) / 100;
  return { area, scale };
}
