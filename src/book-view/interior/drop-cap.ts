/**
 * Опущенная буквица — как у PDF (pdf/interior/text-block.tsx: DropCapParagraph): буква, рядом колонка со строками
 * абзаца (видно ровно plan.lines), ниже — продолжение с того знака, где кончились строки колонки. Где кончились —
 * решает доводка вёрстки (flow.dropSplit); до первого замера — оценка estimateDropSplit. Строки колонки — Кнут — Пласс
 * по ширине колонки (как у react-pdf), отсюда и настоящее место продолжения.
 */
import { dropCapPlan, estimateDropSplit, leadParts, splitInitial, type DropCapPlan } from "@/lib/book/typesetting";
import type { TextLine } from "@/lib/book/linebreak";
import type { PageKit } from "./kit";
import type { BreakRequest, TextSpec } from "./line-breaker";
import { bodySpec, faceSpec, leadSpec, measureWidthPt } from "./text-specs";

export interface DropCapLayout {
  plan: DropCapPlan;
  initial: string;
  /** Абзац после буквы (с капителью в начале, если она есть). */
  rest: string;
  /** Капитель в начале rest: длина (0 — нет). */
  lead: number;
  /** Ширина колонки рядом с буквицей, pt. */
  column: number;
  /** Строки колонки (весь остаток абзаца по ширине колонки — видны первые plan.lines). */
  lines: TextLine[];
  /** С какого знака rest продолжается абзац под буквицей: решение доводки или оценка. */
  split: number;
  /** Где он продолжился бы по строкам колонки — следующее решение доводки. */
  real: number;
  /** Продолжение абзаца под буквицей. */
  after: string;
  /** Запрос строк колонки и продолжения (для разметки и дерева полос). */
  columnReq: BreakRequest;
  afterReq: BreakRequest;
}

/** Буквица абзаца по набору kit; нет буквицы, буквы или строк — null. */
export function dropCapLayout(kit: PageKit, text: string, leadIn: boolean, pid: string | undefined, mark?: number): DropCapLayout | null {
  const { design, sizes: S } = kit;
  const plan = dropCapPlan(design, S);
  const parts = splitInitial(text);
  if (!plan || plan.style !== "drop" || !parts || !kit.breaker?.width) return null;
  const [initial, rest] = parts;
  const cap: TextSpec = faceSpec(plan.face, plan.size);
  const capW = kit.breaker.width(cap, initial);
  if (capW === null) return null;
  const measureW = measureWidthPt(kit);
  const column = measureW - capW - plan.gap;
  const [leadText, tail] = leadParts(rest, leadIn, mark, initial.length);
  const columnReq: BreakRequest = {
    text: leadText + tail,
    spec: bodySpec(kit),
    ...(leadText ? { runs: [{ start: 0, end: leadText.length, spec: leadSpec(kit) }, { start: leadText.length, end: leadText.length + tail.length, spec: bodySpec(kit) }] } : {}),
    width: column,
    hyphens: true,
    justify: (design.text?.align ?? "justify") === "justify",
  };
  const lines = kit.breaker(columnReq);
  if (!lines) return null;
  const real = lines.length > plan.lines ? lines[plan.lines - 1].end : rest.length;
  const decided = pid ? kit.dropSplit?.get(pid) : undefined;
  const split = Math.min(rest.length, decided ?? estimateDropSplit(rest, design, S, plan, measureW));
  const after = rest.slice(split).replace(/^\s+/, "");
  return { plan, initial, rest, lead: leadText.length, column, lines, split, real, after, columnReq, afterReq: { text: after, spec: bodySpec(kit), width: measureW, hyphens: true, justify: columnReq.justify } };
}
