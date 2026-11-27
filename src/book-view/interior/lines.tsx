/**
 * Текст по строкам PDF (lib/book/linebreak.ts через kit.breaker): каждая строка — свой блок, браузер её не переносит.
 * Строка по ширине растягивается до края (кроме последней), перенос — дефисом, как у react-pdf. Висячие строки — как
 * orphans/widows 2 у PDF: первые две и последние две строки абзаца на полосе не разлучаются.
 *
 * Разбивки нет (рендер на сервере, шрифт ещё грузится, миниатюры) — текст как есть, строки ставит браузер.
 */
import type { CSSProperties, ReactNode } from "react";
import { justifySpacing } from "@/lib/book/linebreak";
import type { BreakRequest } from "./line-breaker";
import type { PageKit } from "./kit";
import { lineBreaks } from "./breaks";

export type TextAlignment = "justify" | "left" | "center" | "right";

export interface LinesProps {
  kit: PageKit;
  /** Что разбивать (ширина и красная строка — pt, как у PDF). */
  req: BreakRequest;
  align: TextAlignment;
  /** Висячие строки, как orphans/widows 2 у PDF (у основного текста). */
  keepPairs?: boolean;
  /** Куски с другим видом (капитель): [start, end) текста и стиль. */
  styled?: readonly { start: number; end: number; style: CSSProperties }[];
  /** Пометка блока: по ней — разрывы полос перед строками (kit.breaks). */
  pid?: string;
  /** Свой вид первой строки (строка с поднятой буквицей: выше остальных). */
  firstLine?: CSSProperties;
  /**
   * Текст у PDF — в контейнере с alignItems: center (по ширине содержимого, Yoga AtMost). react-pdf ставит строки по
   * ширине req.width и сдвигает их на alignOffset: если самая широкая строка с пробелом в конце шире req.width, текст
   * уезжает вправо на половину излишка — так же сдвигаем и здесь (atMostShift).
   */
  centered?: boolean;
  /** Не больше строк (maxLines у PDF): последняя — без пробелов в конце и с многоточием, как truncate у textkit. */
  maxLines?: number;
}

/** Строки PDF для текста; null — разбивки нет (текст ставит браузер). */
export const breakText = (kit: PageKit, req: BreakRequest) => kit.breaker?.(req) ?? null;

/**
 * Текст строками PDF; разбивки нет — null (тогда текст ставит браузер). Перевод строки в тексте — новый абзац, как у
 * react-pdf (строки стихов и цитат): каждый ломается сам, висячие строки считаются по всем строкам блока.
 */
export function lineSpans({ kit, req, align, keepPairs = false, styled = [], pid, firstLine, centered = false, maxLines }: LinesProps): ReactNode[] | null {
  const text = req.text;
  let lines: { start: number; end: number; hyphen: boolean; last: boolean; natural?: number; trailing?: number; width: number; ellipsis?: boolean }[] = [];
  let from = 0;
  for (const para of text.split("\n")) {
    const part = breakText(kit, { ...req, text: para, ...(from ? { runs: undefined, indent: 0 } : {}) });
    if (!part) return null;
    // Ширина строки — как у PDF: у первой строки блока — без красной строки.
    part.forEach((l, i) => lines.push({ start: l.start + from, end: l.end + from, hyphen: l.hyphen, last: i === part.length - 1, natural: l.natural, trailing: l.trailing, width: req.width - (!from && !i ? (req.indent ?? 0) : 0) }));
    from += para.length + 1;
  }
  if (maxLines !== undefined && lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    const l = lines[maxLines - 1];
    let end = l.end;
    while (end > l.start && text[end - 1] === " ") end--;
    lines[maxLines - 1] = { ...l, end, hyphen: false, last: true, ellipsis: true, natural: undefined };
  }
  const indent = req.indent ? kit.u.pt(req.indent) : undefined;
  const n = lines.length;
  const cuts = lineBreaks(kit, pid);
  const shift = centered ? atMostShift(lines, req.width, align) : 0;
  return lines.map((line, i) => {
    // Последняя строка абзаца — не по ширине (у react-pdf так же).
    const last = line.last;
    // Выключка — как у react-pdf (justifySpacing), а не браузерная: по ширине и строка, которая шире полосы (её PDF
    // сжимает и при другом выравнивании). Добавки — межбуквенным и межсловным интервалом строки.
    const fit = line.natural !== undefined && ((align === "justify" && !last) || line.natural > line.width + 0.01);
    const spacing = fit ? justifySpacing(text.slice(line.start, line.end).replace(/ +$/, "") + (line.hyphen ? "-" : ""), line.width - line.natural!) : null;
    const tracking = (spec: { tracking?: number }) => kit.u.pt((spec.tracking ?? 0) + spacing!.letter);
    // Куски строки по видам (капитель — свой стиль).
    const parts: ReactNode[] = [];
    let at = line.start;
    for (const s of styled) {
      const a = Math.max(line.start, s.start);
      const b = Math.min(line.end, s.end);
      if (b <= a) continue;
      if (a > at) parts.push(text.slice(at, a));
      // Свой кусок (капитель, буквица) — своя разрядка начертания и та же добавка выключки.
      const run = spacing ? req.runs?.find((r) => r.start === s.start) : undefined;
      parts.push(
        <span key={a} style={run ? { ...s.style, letterSpacing: tracking(run.spec) } : s.style}>
          {text.slice(a, b)}
        </span>,
      );
      at = b;
    }
    if (at < line.end) parts.push(text.slice(at, line.end));
    const style: CSSProperties = {
      display: "block",
      whiteSpace: "nowrap",
      ...(spacing
        ? { textAlign: "left", letterSpacing: tracking(req.spec), wordSpacing: kit.u.pt(spacing.space - spacing.letter) }
        : { textAlign: align === "justify" ? (last ? "left" : "justify") : align, ...(align === "justify" && !last ? { textAlignLast: "justify" } : {}) }),
      // Красная строка — только у первой (text-indent наследуется, у остальных его снимаем).
      textIndent: i === 0 && indent ? indent : 0,
      // orphans/widows 2: не рвать после первой строки и перед последней.
      ...(keepPairs && !kit.breaks && n > 1 && (i === 0 || i === n - 2) ? { breakAfter: "avoid" } : {}),
      // Новая полоса с этой строки — как у PDF (разбивка lib/book/paginate.ts).
      ...(cuts.has(i) ? { breakBefore: "column" } : {}),
      ...(i === 0 ? firstLine : {}),
      ...(shift ? { position: "relative", left: kit.u.pt(shift) } : {}),
    };
    return (
      <span key={i} style={style}>
        {parts}
        {line.hyphen ? "-" : line.ellipsis ? "…" : null}
      </span>
    );
  });
}

/**
 * Сдвиг текста по центру в контейнере с alignItems: center, как у react-pdf (layout: measureText в режиме AtMost;
 * render: alignOffset). Строки ставятся по ширине width; узел — шириной min(width, M), где M — самая широкая строка
 * вместе с пробелами в конце (сжатая под ширину — во всю ширину), и по центру контейнера; строки отрисовка сдвигает на
 * −(width − M) / 2. Пока M не больше width, это ровно центр; если больше — текст уезжает вправо на (M − width) / 2.
 */
function atMostShift(lines: readonly { natural?: number; trailing?: number; width: number; last: boolean }[], width: number, align: TextAlignment) {
  if (align !== "center") return 0;
  let M = 0;
  for (const l of lines) {
    if (l.natural === undefined) return 0;
    const fitted = l.natural > l.width + 0.01 ? l.width : l.natural;
    M = Math.max(M, fitted + (l.trailing ?? 0));
  }
  return M > width ? (M - width) / 2 : 0;
}
