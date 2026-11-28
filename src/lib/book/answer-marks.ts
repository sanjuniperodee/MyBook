/**
 * Кнопки «По центру» и «Капитель» редактора ответа: ставят и снимают пометки автора в тексте (answer-blocks.ts) —
 * >>…<< у строк по центру, ^^…^^ у начальных слов абзаца. Чистые функции над текстом и выделением: редактор только
 * подставляет результат и ставит выделение.
 */
import { centerLine, leadMark } from "./answer-blocks";
import { splitLeadIn } from "./typesetting";

export interface MarkEdit {
  value: string;
  /** Выделение после правки. */
  start: number;
  end: number;
}

/** Границы строк, которых касается выделение [start, end). */
function touchedLines(value: string, start: number, end: number) {
  const from = start > 0 ? value.lastIndexOf("\n", start - 1) + 1 : 0;
  // Выделение кончается в начале строки (тройной клик) — эта строка не выделена.
  const stop = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const next = value.indexOf("\n", stop);
  return { from, to: next < 0 ? value.length : next };
}

/**
 * «По центру»: непустые строки выделения (или строка с курсором) — в >>…<<; если все они уже по центру — пометка
 * снимается (кнопка работает как переключатель).
 */
export function toggleCenter(value: string, start: number, end: number): MarkEdit {
  const { from, to } = touchedLines(value, start, end);
  const lines = value.slice(from, to).split("\n");
  const filled = lines.filter((l) => l.trim());
  if (!filled.length) return { value, start, end };
  const on = filled.every((l) => centerLine(l) !== null);
  const out = lines.map((l) => (!l.trim() ? l : on ? centerLine(l)! : `>> ${(leadMark(l)?.text ?? l).trim()} <<`)).join("\n");
  return { value: value.slice(0, from) + out + value.slice(to), start: from, end: from + out.length };
}

/**
 * «Капитель»: начало абзаца с курсором — в ^^…^^. Выделены слова с начала абзаца — капителью они, иначе — первые
 * слова по правилу начала главы. Абзац уже с пометкой — она снимается.
 */
export function toggleLead(value: string, start: number, end: number): MarkEdit {
  const { from, to } = touchedLines(value, start, start);
  const line = value.slice(from, to);
  const indent = line.length - line.trimStart().length;
  const body = line.slice(indent);
  if (!body.trim() || centerLine(line) !== null) return { value, start, end };
  const marked = leadMark(line);
  let out: string;
  if (marked) out = marked.text;
  else {
    // Выделение внутри абзаца, от его начала: капителью ровно выделенное.
    const picked = end > start && start <= from + indent && end <= to ? value.slice(from + indent, end).trim() : "";
    const head = picked && body.startsWith(picked) ? picked : splitLeadIn(body)[0];
    out = head ? `^^${head}^^${body.slice(head.length)}` : body;
  }
  const next = line.slice(0, indent) + out;
  const caret = from + next.length;
  return { value: value.slice(0, from) + next + value.slice(to), start: caret, end: caret };
}
