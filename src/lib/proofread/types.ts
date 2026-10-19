/**
 * Проверка текста ответов («как Grammarly»): общие типы для правил, словаря и AI-корректора.
 * Замечание — диапазон в тексте ответа и варианты замены этого диапазона.
 */

/** spelling — орфография, punctuation — запятые и знаки, grammar — согласование и управление, typography — оформление, style — речь. */
export type IssueKind = "spelling" | "punctuation" | "grammar" | "typography" | "style";

export const issueKinds: IssueKind[] = ["spelling", "punctuation", "grammar", "typography", "style"];

export interface Issue {
  /** Ключ замечания: по нему его можно «пропустить» во всей книге. */
  key: string;
  start: number;
  end: number;
  kind: IssueKind;
  /** Правило (код для подписи из словаря интерфейса); у словаря — "spell", у AI — "ai". */
  rule: string;
  /** Пояснение, если оно не из словаря интерфейса (AI пишет его сам). */
  note?: string;
  /** Варианты замены диапазона: первый — основной; "" — удалить. */
  replacements: string[];
  source: "rules" | "spell" | "ai";
  /** Правку можно применить вслепую, пачкой («Исправить оформление»). */
  safe?: boolean;
}

/** Применяет замену диапазона и возвращает новый текст. */
export function applyIssue(text: string, issue: Pick<Issue, "start" | "end">, replacement: string) {
  return text.slice(0, issue.start) + replacement + text.slice(issue.end);
}

/** Сдвиг замечаний после замены диапазона [start, end) текстом длины length: задетые правкой пропадают. */
export function shiftByEdit<T extends Pick<Issue, "start" | "end">>(issues: T[], start: number, end: number, length: number): T[] {
  const delta = length - (end - start);
  return issues.flatMap((i) => {
    if (i.end <= start && !(i.start === i.end && i.start === start && end > start)) return [i];
    if (i.start >= end) return [{ ...i, start: i.start + delta, end: i.end + delta }];
    return [];
  });
}

/**
 * Сдвигает замечания после правки текста (одна непрерывная правка — как при наборе или вставке):
 * то, что до правки, остаётся на месте, что после — сдвигается, задетые правкой — пропадают.
 */
export function shiftIssues<T extends Pick<Issue, "start" | "end">>(issues: T[], before: string, after: string): T[] {
  if (before === after) return issues;
  let head = 0;
  const max = Math.min(before.length, after.length);
  while (head < max && before[head] === after[head]) head++;
  let tail = 0;
  while (tail < max - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  return shiftByEdit(issues, head, before.length - tail, after.length - before.length + (before.length - tail - head));
}

/** Замечания без наложений: при пересечении остаётся то, что раньше в списке (списки идут по важности). */
export function withoutOverlaps<T extends Pick<Issue, "start" | "end">>(issues: T[]): T[] {
  const taken: T[] = [];
  for (const i of issues) if (!taken.some((t) => i.start < t.end && t.start < i.end && !(i.start === i.end && t.start === t.end))) taken.push(i);
  return taken.sort((a, b) => a.start - b.start || a.end - b.end);
}
