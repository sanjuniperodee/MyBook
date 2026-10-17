import { MM_TO_PT, type BookFormat } from "./formats";
import type { InteriorDesign } from "./interiors";
import { interiorSizes, OPENER } from "./typesetting";
import { interiorMetrics, textArea } from "./page-geometry";
import { openerPhotoPlan } from "./photo-pages";

/**
 * Начальная полоса главы с длинным названием и эпиграфом (своя книга: до 120 и 300 знаков). Банки вопросов дают
 * короткие названия, и там ничего не меняется; своё название или эпиграф, которые не уместятся под снимком или
 * на цветной полосе, уменьшаются так же в PDF и в HTML (3D-книга, превью): иначе начальная полоса уйдёт на
 * вторую, а номера в оглавлении, оценка объёма и раскладка 3D разойдутся с PDF.
 */
export interface OpenerFit {
  /** Кегль названия, pt (меньше, чем у дизайна, только если название не помещается). */
  titleSize: number;
  /** Сколько строк эпиграфа оставить (дальше — многоточие); null — эпиграф помещается целиком. */
  epigraphLines: number | null;
}

/** Ширина средней буквы названия и эпиграфа, в кеглях: с запасом, чтобы не недооценить высоту. */
const TITLE_EM = 0.58;
const EPIGRAPH_EM = 0.54;
/** Доля свободной высоты, которую можно отдать под название: остальное — эпиграфу. */
const TITLE_SHARE = 0.55;
/** Наименьший кегль названия относительно кегля дизайна. */
const MIN_TITLE_SCALE = 0.55;
const MIN_EPIGRAPH_LINES = 2;
/**
 * Самые длинные название и эпиграф главы в банках вопросов (знаков). Начальные полосы с ними проверены вёрсткой
 * в каждом оформлении и формате, поэтому занимаемая ими высота — «запас, который точно помещается»: короче — ничего
 * не меняем, даже там, где под снимком тесно по оценке. Тест opener-fit следит, чтобы банки не выходили за эти числа.
 */
export const BANK_OPENER = { title: 42, epigraph: 66 } as const;
/** Запас оценки свободной высоты полосы (там, где места много, длинный текст не трогаем). */
const SAFETY = 0.9;

const lineCount = (chars: number, width: number, size: number, em: number) => Math.max(1, Math.ceil((chars * size * em) / width));

export function openerFit(format: BookFormat, design: InteriorDesign, text: { title: string; epigraph?: string; number: number | null; photo: boolean }): OpenerFit {
  const S = interiorSizes(design, interiorMetrics[format.id].scale);
  const { align, number: markKind } = design.opener;
  const area = textArea(format);
  const width = area.w * MM_TO_PT;
  const top = (text.photo ? openerPhotoPlan(format, design)?.textTop : undefined) ?? design.opener.top;

  const face = design.display;
  const em = TITLE_EM + (face.upper ? 0.12 + (face.tracking ?? 0) : (face.tracking ?? 0));
  const titleWidth = width * 0.9;
  const epigraphWidth = width * (align === "left" ? 0.85 : 0.78);
  const epigraphLine = S.epigraph * OPENER.epigraph.lineHeight;
  const titleHeight = (chars: number, size: number) => lineCount(chars, titleWidth, size, em) * size * OPENER.title.lineHeight;
  const epigraphHeight = (chars: number) => (chars ? lineCount(chars, epigraphWidth, S.epigraph, EPIGRAPH_EM) * epigraphLine : 0);

  // Свободная высота: либо по оценке полосы, либо как у самой длинной главы банков (она помещается во всех оформлениях).
  const mark = !text.number ? 0 : markKind === "label" ? S.kicker * 1.4 + S.kickerGap : S.numeral * OPENER.numeral.lineHeight * (1 + OPENER.numeral.after);
  const byPage = area.h * MM_TO_PT * (1 - top) * SAFETY - mark - S.vignetteGap * 2;
  const room = Math.max(byPage, titleHeight(BANK_OPENER.title, S.openerTitle) + epigraphHeight(BANK_OPENER.epigraph));

  const epigraph = text.epigraph?.length ?? 0;
  if (titleHeight(text.title.length, S.openerTitle) + epigraphHeight(epigraph) <= room) return { titleSize: S.openerTitle, epigraphLines: null };

  let titleSize = S.openerTitle;
  while (titleHeight(text.title.length, titleSize) > room * TITLE_SHARE && titleSize > S.openerTitle * MIN_TITLE_SCALE) titleSize = Math.max(S.openerTitle * MIN_TITLE_SCALE, titleSize * 0.92);

  if (!epigraph) return { titleSize, epigraphLines: null };
  const fit = Math.max(MIN_EPIGRAPH_LINES, Math.floor((room - titleHeight(text.title.length, titleSize)) / epigraphLine));
  return { titleSize, epigraphLines: lineCount(epigraph, epigraphWidth, S.epigraph, EPIGRAPH_EM) > fit ? fit : null };
}
