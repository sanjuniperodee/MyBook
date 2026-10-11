/**
 * Правила проверки, которые работают мгновенно и без сети — прямо в браузере при наборе:
 * пробелы у знаков препинания, тире, кавычки, многоточие, заглавная в начале предложения,
 * повтор слова, слитные и раздельные написания частых слов («итд», «из за», «кто то»), эмодзи.
 * Каждое правило знает, безопасно ли применять его вслепую («Исправить оформление»).
 */
import type { Locale } from "@/i18n/config";
import { withoutOverlaps, type Issue, type IssueKind } from "./types";

type Found = Omit<Issue, "key" | "source"> & { match: string };

const L = "\\p{L}";
const issue = (rule: string, kind: IssueKind, start: number, end: number, text: string, replacements: string[], safe: boolean): Found => ({
  rule,
  kind,
  start,
  end,
  replacements,
  safe,
  match: text.slice(start, end),
});

function* matches(text: string, re: RegExp) {
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    yield m;
    if (m[0] === "") re.lastIndex++;
  }
}

/** Сохраняет регистр первой буквы исходного слова. */
const keepCase = (src: string, to: string) => (/^\p{Lu}/u.test(src) ? to.charAt(0).toUpperCase() + to.slice(1) : to);

/** Сокращения, после точки которых предложение не кончается. */
const ABBR = /(?:^|[\s(«"])(?:т|д|п|е|к|г|гг|др|пр|им|ул|пер|см|стр|тыс|млн|млрд|руб|коп|обл|р|ж|б|кв|м|км|кг|ч|мин|сек|с|в|вв|н|э|т\.\s?[дпек]|т\.б|ж\.т\.б|т\.с\.с|ш|н\.э)\.$/iu;

/** Слитные, раздельные и дефисные написания частых слов (только русские тексты). safe — можно править вслепую. */
const WORDS: [RegExp, string, boolean, IssueKind][] = [
  [/(?<![\p{L}-])итд(?![\p{L}])\.?/giu, "и т. д.", true, "spelling"],
  [/(?<![\p{L}-])итп(?![\p{L}])\.?/giu, "и т. п.", true, "spelling"],
  [/(?<![\p{L}-])тк(?![\p{L}])/giu, "т. к.", true, "spelling"],
  [/(?<![\p{L}-])щас(?![\p{L}])/giu, "сейчас", false, "style"],
  [/(?<![\p{L}-])чтоли(?![\p{L}])/giu, "что ли", true, "spelling"],
  [/(?<![\p{L}-])вообщем(?![\p{L}])/giu, "в общем", true, "spelling"],
  [/(?<![\p{L}-])впринципе(?![\p{L}])/giu, "в принципе", true, "spelling"],
  [/(?<![\p{L}-])всмысле(?![\p{L}])/giu, "в смысле", true, "spelling"],
  [/(?<![\p{L}-])вобщем(?![\p{L}])/giu, "в общем", true, "spelling"],
  [/(?<![\p{L}-])(?:все|всё)\s+(?:таки|равно\s+таки)(?![\p{L}])/giu, "всё-таки", true, "spelling"],
  [/(?<![\p{L}-])(?:все|всё)таки(?![\p{L}])/giu, "всё-таки", true, "spelling"],
  [/(?<![\p{L}-])из\s+за(?![\p{L}])/giu, "из-за", true, "spelling"],
  [/(?<![\p{L}-])из\s+под(?![\p{L}])/giu, "из-под", true, "spelling"],
  [/(?<![\p{L}-])по\s+прежнему(?![\p{L}])/giu, "по-прежнему", false, "spelling"],
  [/(?<![\p{L}-])кое\s+(кто|что|где|как|какой|какая|какие|когда|куда|чем|кого|кому|чего)(?![\p{L}])/giu, "кое-$1", true, "spelling"],
  [/(?<![\p{L}-])(кто|что|где|куда|когда|как|какой|какая|какое|какие|какого|какую|каким|какими|какому|каком|чей|чья|чьё|чьи|почему|зачем|откуда|сколько|кого|кому|чего|чем|ком)\s+(то|либо|нибудь)(?![\p{L}])/giu, "$1-$2", false, "spelling"],
  [/(?<![\p{L}-])(кто|что|где|когда|как|почему|какой|какая|какие)(то|нибудь)(?![\p{L}])/giu, "$1-$2", true, "spelling"],
  [/(?<![\p{L}-])координально(?![\p{L}])/giu, "кардинально", true, "spelling"],
  [/(?<![\p{L}-])ихн(?:ий|яя|ее|ие|его|ей|их|им|ими|ем)(?![\p{L}])/giu, "их", false, "style"],
];

/** Эмодзи (кроме ©, ®, ™) вместе с модификаторами, склейками и флагами. */
const EMOJI = /(?:(?![©®™])\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}])(?:\p{Emoji_Modifier}|[︎️⃣]|‍(?:(?![©®™])\p{Extended_Pictographic}))*[︎️]?/gu;

function findAll(text: string, language: Locale): Found[] {
  const out: Found[] = [];
  const push = (f: Found) => out.push(f);

  // Эмодзи: в книжных шрифтах их нет — в печати они пропадают.
  for (const m of matches(text, EMOJI)) {
    let end = m.index + m[0].length;
    const start = m.index > 0 && text[m.index - 1] === " " && (end === text.length || /[\s.,!?]/.test(text[end])) ? m.index - 1 : m.index;
    if (start === m.index && text[end] === " " && (start === 0 || text[start - 1] === "\n")) end++;
    push(issue("emoji", "typography", start, end, text, [""], true));
  }

  // Пробел перед знаком препинания: «слово , слово» → «слово, слово».
  for (const m of matches(text, new RegExp(`(?<=[${L}\\d»")\\]])([ \\t]+)(?=[,.!?;:…)»](?![.]{2}))`, "gu")))
    push(issue("spaceBefore", "typography", m.index, m.index + m[1].length, text, [""], true));

  // Пробел после открывающей скобки или кавычки: «( слово» → «(слово».
  for (const m of matches(text, /([(«„])([ \t]+)(?=\S)/gu)) push(issue("spaceAfterOpen", "typography", m.index + 1, m.index + 1 + m[2].length, text, [""], true));

  // Нет пробела после знака: «слово,слово», «конец.Начало», «да!Нет».
  for (const m of matches(text, new RegExp(`(?<=[${L}])([,;!?])(?=[${L}])`, "gu"))) push(issue("spaceAfter", "typography", m.index, m.index + 1, text, [`${m[1]} `], true));
  for (const m of matches(text, new RegExp(`(?<=[${L}]{2})([.:])(?=\\p{Lu}\\p{Ll})`, "gu"))) push(issue("spaceAfter", "typography", m.index, m.index + 1, text, [`${m[1]} `], true));

  // Двойные пробелы внутри строки.
  for (const m of matches(text, /(?<=\S)[ \t]{2,}(?=\S)/g)) push(issue("doubleSpace", "typography", m.index, m.index + m[0].length, text, [" "], true));

  // Дефис вместо тире: «слово - слово», «- Привет» в начале реплики, «--».
  for (const m of matches(text, /(?<=\S) (-|–|--) (?=\S)/g)) push(issue("dash", "typography", m.index, m.index + m[0].length, text, [" — "], true));
  for (const m of matches(text, /(?<=^|\n)[ \t]*(-|–|--)[ \t]*(?=\S)/g)) push(issue("dash", "typography", m.index, m.index + m[0].length, text, ["— "], true));

  // Многоточие одним знаком.
  for (const m of matches(text, /(?<![.])\.{3,}|…\.+|\.{2}(?![.])(?=\s|$)/g)) push(issue("ellipsis", "typography", m.index, m.index + m[0].length, text, ["…"], true));

  // Кавычки-«ёлочки» вместо "прямых" и “английских”.
  // Прямые — только парой: открывающая в начале слова, закрывающая в конце (иначе непарная кавычка «съест» абзац).
  const QUOTES = /""([^"\n]{1,200}?)""|(?<=^|[\s(\[—–-])"(?=\S)([^"\n]{1,200}?)(?<=\S) ?"(?=$|[\s.,!?;:)\]…—–-])|“([^”\n]{1,200})”|„([^“\n]{1,200})“/g;
  for (const m of matches(text, QUOTES)) {
    const inner = m[1] ?? m[2] ?? m[3] ?? m[4];
    push(issue("quotes", "typography", m.index, m.index + m[0].length, text, [`«${inner.trim()}»`], true));
  }

  // Повторы знаков: «!!!» → «!», «??» → «?».
  for (const m of matches(text, /(!{2,}|\?{2,})(?![!?])/g)) push(issue("repeatMark", "style", m.index, m.index + m[0].length, text, [m[0][0]], false));

  // Повтор слова: «и и», «что что». Удвоения для выразительности («да да», «тук тук») — не ошибка.
  const doubles = new Set(["да", "нет", "ну", "так", "ой", "ах", "ох", "ха", "хи", "тук", "кап", "ля", "на", "давай", "иди", "скорей", "скорее", "ещё", "еще", "очень", "много", "долго", "мало", "бип", "ай", "уа", "ля-ля", "иә", "жоқ", "тез", "ақырын", "әрең"]);
  for (const m of matches(text, new RegExp(`(?<![${L}-])([${L}]+)([ \\t]+)(\\1)(?![${L}-])`, "giu"))) {
    if (doubles.has(m[1].toLowerCase())) continue;
    const start = m.index + m[1].length;
    push(issue("repeatWord", "grammar", start, start + m[2].length + m[3].length, text, [""], false));
  }

  // Строчная буква в начале предложения: после «. ! ?» (не после сокращения и не после «…»), в начале текста.
  for (const m of matches(text, /(^|[.!?][)»"]?)([ \t]*\n?[ \t]*)(\p{Ll})/gu)) {
    const letterAt = m.index + m[1].length + m[2].length;
    if (m[1] === "") {
      if (m.index !== 0 && text[m.index - 1] !== "\n") continue;
      // Начало абзаца: заглавная нужна, если предыдущая строка закончила предложение (или это начало текста).
      const prevLine = text.slice(0, m.index).replace(/\s+$/, "");
      if (prevLine && !/[.!?]["»)]?$/.test(prevLine)) continue;
    } else {
      if (!m[2]) continue;
      if (m[1][0] === "." && ABBR.test(text.slice(Math.max(0, m.index - 8), m.index + 1))) continue;
    }
    // Слово целиком подчёркиваем, меняем только первую букву.
    const word = text.slice(letterAt).match(new RegExp(`^[${L}]+`, "u"))![0];
    push(issue("capital", "grammar", letterAt, letterAt + word.length, text, [word.charAt(0).toUpperCase() + word.slice(1)], true));
  }

  if (language === "ru")
    for (const [re, to, safe, kind] of WORDS)
      for (const m of matches(text, re)) {
        const replacement = m[0].replace(new RegExp(re.source, re.flags.replace("g", "")), to).replace(/\s+/g, (s) => (s.includes("\n") ? s : " "));
        push(issue("word", kind, m.index, m.index + m[0].length, text, [keepCase(m[0], replacement)], safe));
      }

  return out;
}

/** Порядок важности при наложении: смысловые правила раньше оформительских. */
const PRIORITY = ["word", "repeatWord", "capital", "quotes", "emoji", "dash", "ellipsis", "spaceAfter", "spaceBefore", "spaceAfterOpen", "doubleSpace", "repeatMark"];

/** Замечания правил по тексту ответа. Ключ — правило и исходный фрагмент: «пропустить» скрывает такие же во всей книге. */
export function checkRules(text: string, language: Locale): Issue[] {
  const found = findAll(text, language)
    .filter((f) => f.replacements.some((r) => r !== f.match))
    .sort((a, b) => PRIORITY.indexOf(a.rule) - PRIORITY.indexOf(b.rule) || a.start - b.start);
  return withoutOverlaps(found).map(({ match, ...f }) => ({ ...f, key: `${f.rule}|${match}`, source: "rules" as const }));
}

/**
 * Применяет все безопасные правки разом (с конца, чтобы не сбить позиции); повторяет, пока находятся
 * новые (после удаления пробела перед запятой может появиться ещё что-то). Пропущенные пользователем не трогает.
 */
export function fixSafe(
  text: string,
  language: Locale,
  skip: (issue: Issue) => boolean = () => false,
  /** Каждая правка по порядку применения — чтобы сдвинуть другие замечания (например, AI). */
  onEdit?: (start: number, end: number, replacement: string) => void,
): string {
  let out = text;
  for (let pass = 0; pass < 4; pass++) {
    const safe = checkRules(out, language).filter((i) => i.safe && !skip(i));
    if (!safe.length) break;
    for (const i of [...safe].sort((a, b) => b.start - a.start)) {
      out = out.slice(0, i.start) + i.replacements[0] + out.slice(i.end);
      onEdit?.(i.start, i.end, i.replacements[0]);
    }
  }
  return out;
}
