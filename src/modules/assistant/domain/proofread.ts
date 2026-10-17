/**
 * AI-корректор ответов книги: промпт, схема ответа и привязка правок к тексту.
 *
 * Модель возвращает не позиции (их она путает), а точный фрагмент текста и его исправление.
 * Фрагмент ищем в тексте сами: не нашли дословно — правку отбрасываем, нашли — сужаем подчёркивание
 * до изменившихся слов. Так корректор не может «переписать» текст или подчеркнуть не то место.
 */
import type { Locale } from "@/i18n/config";
import type { BookKind } from "@/lib/content/kinds";
import type { Issue, IssueKind } from "@/lib/proofread/types";

const proofreadKinds = ["spelling", "punctuation", "grammar", "style"] as const satisfies readonly IssueKind[];

export const proofreadSchema = {
  type: "object",
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          fragment: { type: "string", description: "Точный фрагмент исходного текста (1–4 слова), как он написан" },
          replacement: { type: "string", description: "Исправленный фрагмент" },
          kind: { type: "string", enum: [...proofreadKinds] },
          note: { type: "string", description: "Короткое объяснение правила" },
        },
        required: ["fragment", "replacement", "kind", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["issues"],
  additionalProperties: false,
} as const;

const bookLanguage: Record<Locale, string> = { ru: "русском", kk: "казахском" };
const noteLanguage: Record<Locale, string> = { ru: "по-русски", kk: "по-казахски" };

/** Чем является текст: у подарка — письмо близкому, у автобиографии — рассказ от первого лица, у своей книги — авторский текст. */
const textAbout: Record<BookKind, string> = {
  gift: "ответ автора для подарочной книги-воспоминания: его личная история, письмо близкому человеку",
  autobiography: "рассказ для книги о жизни самого автора, от первого лица; его мог записать близкий человек со слов рассказчика, поэтому разговорная речь и прямые слова рассказчика — норма",
  blank: "фрагмент авторской книги, которую человек пишет сам с чистого листа: заголовки и текст разделов — его голос, жанр и стиль выбирает он",
};

export function proofreadSystemPrompt(language: Locale, ui: Locale, kind: BookKind = "gift") {
  return [
    `Ты — бережный корректор. Текст на ${bookLanguage[language]} языке — ${textAbout[kind]}.`,
    "Найди только настоящие ошибки:",
    "- орфография и опечатки (пропущенные, лишние, перепутанные буквы, слитно/раздельно/через дефис, «не» с разными частями речи, -тся/-ться, н/нн);",
    "- пунктуация: прежде всего запятые (сложные предложения, причастные и деепричастные обороты, вводные слова, обращения, однородные члены), точка или вопрос в конце предложения;",
    "- грамматика: согласование, управление, падежи, формы слов;",
    "- style — только явные речевые ошибки (тавтология «впервые познакомились», неверное употребление слова), не больше трёх.",
    "Не трогай: авторский стиль и интонацию, разговорные слова, ласковые прозвища, сленг, порядок слов, имена и названия, слова другого языка в тексте (казахские в русском и наоборот), смайлики.",
    "Не перефразируй и не «улучшай» текст. Не исправляй оформление: кавычки, тире, многоточия, пробелы и заглавные буквы после точки проверяет другой инструмент.",
    "Каждая правка: fragment — минимальный фрагмент исходного текста (1–4 слова), скопированный символ в символ; replacement — тот же фрагмент с исправлением.",
    "Для пропущенной запятой fragment — слово перед местом запятой, replacement — это слово с запятой («сказал» → «сказал,»).",
    "Если такой фрагмент встречается в тексте несколько раз, добавь соседнее слово, чтобы он стал однозначным.",
    `note — объяснение правила ${noteLanguage[ui]}, до 12 слов, без кавычек вокруг всего текста.`,
    "Если ошибок нет — верни пустой список issues. Ответ — только JSON по схеме.",
  ].join("\n");
}

interface RawEdit {
  fragment: string;
  replacement: string;
  kind: IssueKind;
  note: string;
}

/** Правки из ответа модели: всё, что не по схеме, отбрасывается. */
export function parseProofread(raw: unknown): RawEdit[] {
  const list = (raw as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(list)) return [];
  return list.flatMap((x) => {
    const e = x as Partial<RawEdit>;
    if (typeof e.fragment !== "string" || typeof e.replacement !== "string" || !e.fragment.trim()) return [];
    const kind = (proofreadKinds as readonly string[]).includes(String(e.kind)) ? (e.kind as IssueKind) : "grammar";
    return [{ fragment: e.fragment, replacement: e.replacement, kind, note: typeof e.note === "string" ? e.note.trim().slice(0, 200) : "" }];
  });
}

/** Сужает правку до изменившихся слов: «сказал что» → «сказал, что» даёт «сказал» → «сказал,». */
function tighten(fragment: string, replacement: string): { head: number; from: string; to: string } {
  const a = fragment.split(/(\s+)/);
  const b = replacement.split(/(\s+)/);
  let i = 0;
  while (i < a.length - 1 && i < b.length - 1 && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - 1 - i && j < b.length - 1 - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  // Режем по словам (чётные индексы — слова, нечётные — пробелы): начало и конец — на границе слова.
  if (i % 2) i--;
  if (j % 2) j--;
  const head = a.slice(0, i).join("").length;
  return { head, from: a.slice(i, a.length - j).join(""), to: b.slice(i, b.length - j).join("") };
}

/**
 * Привязывает правки модели к тексту. offset — где этот кусок стоит во всём ответе (при проверке по частям).
 * Фрагмент, встречающийся несколько раз, привязывается к первому ещё не занятому вхождению.
 */
export function locateEdits(text: string, edits: RawEdit[], offset = 0): Issue[] {
  const taken: [number, number][] = [];
  const out: Issue[] = [];
  for (const e of edits) {
    if (e.fragment === e.replacement) continue;
    let at = -1;
    for (let from = 0; ; ) {
      const i = text.indexOf(e.fragment, from);
      if (i < 0) break;
      if (!taken.some(([s, f]) => i < f && s < i + e.fragment.length)) {
        at = i;
        break;
      }
      from = i + 1;
    }
    if (at < 0) continue;
    taken.push([at, at + e.fragment.length]);
    const t = tighten(e.fragment, e.replacement);
    const start = offset + at + t.head;
    out.push({
      key: `ai|${t.from}|${t.to}`,
      start,
      end: start + t.from.length,
      kind: e.kind,
      rule: "ai",
      note: e.note || undefined,
      replacements: [t.to],
      source: "ai",
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Куски текста для проверки по абзацам, не длиннее maxChars (длинный ответ — несколько запросов). */
export function proofreadChunks(text: string, maxChars = 3500, maxChunks = 5): { text: string; offset: number }[] {
  const chunks: { text: string; offset: number }[] = [];
  let start = 0;
  while (start < text.length && chunks.length < maxChunks) {
    let end = Math.min(text.length, start + maxChars);
    if (end < text.length) {
      const para = text.lastIndexOf("\n", end);
      const sentence = Math.max(text.lastIndexOf(". ", end), text.lastIndexOf("! ", end), text.lastIndexOf("? ", end));
      const cut = para > start + maxChars / 3 ? para : sentence > start + maxChars / 3 ? sentence + 1 : end;
      end = cut;
    }
    if (text.slice(start, end).trim()) chunks.push({ text: text.slice(start, end), offset: start });
    start = end;
  }
  return chunks;
}
