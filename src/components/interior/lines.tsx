/**
 * Текст по строкам PDF (lib/book/linebreak.ts через kit.breaker): каждая строка — свой блок, браузер её не переносит.
 * Строка по ширине растягивается до края (кроме последней), перенос — дефисом, как у react-pdf. Висячие строки — как
 * orphans/widows 2 у PDF: первые две и последние две строки абзаца на полосе не разлучаются.
 *
 * Разбивки нет (рендер на сервере, шрифт ещё грузится, миниатюры) — текст как есть, строки ставит браузер.
 */
import type { CSSProperties, ReactNode } from "react";
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
}

/** Строки PDF для текста; null — разбивки нет (текст ставит браузер). */
export const breakText = (kit: PageKit, req: BreakRequest) => kit.breaker?.(req) ?? null;

/**
 * Текст строками PDF; разбивки нет — null (тогда текст ставит браузер). Перевод строки в тексте — новый абзац, как у
 * react-pdf (строки стихов и цитат): каждый ломается сам, висячие строки считаются по всем строкам блока.
 */
export function lineSpans({ kit, req, align, keepPairs = false, styled = [], pid }: LinesProps): ReactNode[] | null {
  const text = req.text;
  const lines: { start: number; end: number; hyphen: boolean; last: boolean }[] = [];
  let from = 0;
  for (const para of text.split("\n")) {
    const part = breakText(kit, { ...req, text: para, ...(from ? { runs: undefined, indent: 0 } : {}) });
    if (!part) return null;
    part.forEach((l, i) => lines.push({ start: l.start + from, end: l.end + from, hyphen: l.hyphen, last: i === part.length - 1 }));
    from += para.length + 1;
  }
  const indent = req.indent ? kit.u.pt(req.indent) : undefined;
  const n = lines.length;
  const cuts = lineBreaks(kit, pid);
  return lines.map((line, i) => {
    // Последняя строка абзаца — не по ширине (у react-pdf так же).
    const last = line.last;
    // Куски строки по видам (капитель — свой стиль).
    const parts: ReactNode[] = [];
    let at = line.start;
    for (const s of styled) {
      const a = Math.max(line.start, s.start);
      const b = Math.min(line.end, s.end);
      if (b <= a) continue;
      if (a > at) parts.push(text.slice(at, a));
      parts.push(
        <span key={a} style={s.style}>
          {text.slice(a, b)}
        </span>,
      );
      at = b;
    }
    if (at < line.end) parts.push(text.slice(at, line.end));
    const style: CSSProperties = {
      display: "block",
      whiteSpace: "nowrap",
      textAlign: align === "justify" ? (last ? "left" : "justify") : align,
      ...(align === "justify" && !last ? { textAlignLast: "justify" } : {}),
      // Красная строка — только у первой (text-indent наследуется, у остальных его снимаем).
      textIndent: i === 0 && indent ? indent : 0,
      // orphans/widows 2: не рвать после первой строки и перед последней.
      ...(keepPairs && !kit.breaks && n > 1 && (i === 0 || i === n - 2) ? { breakAfter: "avoid" } : {}),
      // Новая полоса с этой строки — как у PDF (разбивка lib/book/paginate.ts).
      ...(cuts.has(i) ? { breakBefore: "column" } : {}),
    };
    return (
      <span key={i} style={style}>
        {parts}
        {line.hyphen ? "-" : null}
      </span>
    );
  });
}
