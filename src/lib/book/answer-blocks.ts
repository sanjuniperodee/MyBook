/**
 * Типографика ответа: абзацы ответа (splitParagraphs) превращаются в блоки набора — обычный абзац,
 * лид, выделенный короткий ответ, список, стихи. Общая для PDF, листаемой книги и превью в редакторе,
 * поэтому все три выглядят одинаково. Номера абзацев сохраняются: фото, вставленное «после абзаца n»,
 * встаёт после блока, в который попал абзац n.
 */

export type AnswerBlock =
  /** Абзац (строки, которые автор перенёс посреди фразы, склеены). */
  | { kind: "para"; text: string; from: number; to: number }
  /** Короткая первая фраза перед длинным текстом — подзаголовок-лид курсивом. */
  | { kind: "lede"; text: string; from: number; to: number }
  /** Весь ответ в пару строк — выделяется крупным курсивом, а не теряется на полосе. */
  | { kind: "quote"; lines: string[]; from: number; to: number }
  | { kind: "list"; ordered: boolean; items: { marker: string; text: string }[]; from: number; to: number }
  /** Короткие строки подряд — стихи, песня, перечисление в столбик. */
  | { kind: "verse"; lines: string[]; from: number; to: number };

/** Весь ответ не длиннее и не больше двух предложений — выделенный короткий ответ. */
export const QUOTE_MAX_CHARS = 140;
const QUOTE_MAX_SENTENCES = 2;
/** Лид — одно короткое предложение. */
const LEDE_MAX_CHARS = 64;
/** Стихи: от трёх коротких строк подряд, и большинство — без точки в конце (у прозы строки кончаются точкой). */
const VERSE_LINE_MAX = 50;
const VERSE_MIN_LINES = 3;

const BULLET = /^[•·▪●◦○■□▸►✓✔*]\s*/u;
const NUMBERED = /^(\d{1,2})[.)]\s+/;
/** Дефис в начале строки — набранное с клавиатуры тире прямой речи или пункта: «- Привет» → «— Привет». */
const HYPHEN_DASH = /^[-–]\s+/;

/**
 * Типографская чистка строки: тире вместо дефиса в начале, без двойных пробелов, без пробела перед знаком
 * препинания и после открывающей скобки («поговорить . Мы» → «поговорить. Мы»), с пробелом после точки перед словом
 * с заглавной («.Тут» → «. Тут»; «00.00» и «т.е.» не трогаются).
 */
export function tidyLine(line: string) {
  return line
    .replace(HYPHEN_DASH, "— ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/(\S)[ \t]+([,.!?;:…)»”])/gu, "$1$2")
    .replace(/([(«„“])[ \t]+/gu, "$1")
    .replace(/([.!?…])(?=\p{Lu}(?:\p{Ll}|\s))/gu, "$1 ");
}

/** Строка — продолжение предыдущей: та оборвалась без точки, а эта начинается со строчной. */
function continues(prev: string, next: string) {
  return !/[.!?…:;»")\]]$/u.test(prev) && /^\p{Ll}/u.test(next);
}

const isDialogue = (s: string) => /^[—–-]/.test(s);
const ENDS_SENTENCE = /[.!?…]["»”)]*$/u;
/** Сколько предложений в тексте (по знакам конца предложения перед пробелом и в конце). */
const sentences = (s: string) => (s.match(/[.!?…]+["»”)]*(\s|$)/gu) ?? []).length || 1;
const looksLikeVerse = (lines: string[]) => lines.filter((l) => ENDS_SENTENCE.test(l)).length * 2 < lines.length;

/** Строки, разорванные автором посреди фразы, — в одну строку (для выделенного ответа). */
function joinBroken(lines: string[]) {
  const out: string[] = [];
  for (const l of lines) {
    if (out.length && continues(out[out.length - 1], l)) out[out.length - 1] += ` ${l}`;
    else out.push(l);
  }
  return out;
}

export function answerBlocks(paragraphs: string[]): AnswerBlock[] {
  const lines = paragraphs.map(tidyLine);
  const n = lines.length;
  if (!n) return [];
  const total = lines.reduce((s, l) => s + l.length, 0);
  const listy = lines.some((l) => BULLET.test(l));
  const text = lines.join(" ");
  if (total <= QUOTE_MAX_CHARS && sentences(text) <= QUOTE_MAX_SENTENCES && !listy && !isDialogue(lines[0])) {
    const joined = joinBroken(lines);
    if (joined.length <= 2) return [{ kind: "quote", lines: joined, from: 0, to: n - 1 }];
  }

  const blocks: AnswerBlock[] = [];
  let i = 0;
  while (i < n) {
    const line = lines[i];
    // Маркированный список: строки с «•» и т. п. подряд.
    if (BULLET.test(line)) {
      const from = i;
      const items: { marker: string; text: string }[] = [];
      while (i < n && BULLET.test(lines[i])) items.push({ marker: "•", text: lines[i++].replace(BULLET, "") });
      blocks.push({ kind: "list", ordered: false, items, from, to: i - 1 });
      continue;
    }
    // Нумерованный — от двух пунктов подряд (одиночное «1.» может быть просто началом фразы).
    if (NUMBERED.test(line) && i + 1 < n && NUMBERED.test(lines[i + 1])) {
      const from = i;
      const items: { marker: string; text: string }[] = [];
      while (i < n && NUMBERED.test(lines[i])) {
        const m = lines[i].match(NUMBERED)!;
        items.push({ marker: `${m[1]}.`, text: lines[i++].slice(m[0].length) });
      }
      blocks.push({ kind: "list", ordered: true, items, from, to: i - 1 });
      continue;
    }
    // Стихи: от трёх коротких строк подряд (не диалог), большинство — без точки в конце.
    let j = i;
    while (j < n && lines[j].length <= VERSE_LINE_MAX && !isDialogue(lines[j]) && !BULLET.test(lines[j]) && !NUMBERED.test(lines[j])) j++;
    if (j - i >= VERSE_MIN_LINES && looksLikeVerse(lines.slice(i, j))) {
      blocks.push({ kind: "verse", lines: lines.slice(i, j), from: i, to: j - 1 });
      i = j;
      continue;
    }
    // Абзац: строки, перенесённые посреди фразы (Enter вместо пробела), склеиваются в один абзац.
    const from = i;
    const group = [line];
    while (i + 1 < n && continues(lines[i], lines[i + 1]) && !BULLET.test(lines[i + 1]) && !NUMBERED.test(lines[i + 1])) group.push(lines[++i]);
    i++;
    blocks.push({ kind: "para", text: group.join(" "), from, to: i - 1 });
  }

  // Лид: первый блок — одна короткая строка, за ней длинный текст.
  const [first, second] = blocks;
  if (
    first?.kind === "para" &&
    first.from === first.to &&
    first.text.length <= LEDE_MAX_CHARS &&
    sentences(first.text) === 1 &&
    !isDialogue(first.text) &&
    !/^[«"„“]/u.test(first.text) &&
    second?.kind === "para" &&
    second.text.length >= 160
  )
    blocks[0] = { kind: "lede", text: first.text, from: first.from, to: first.to };
  return blocks;
}

/** Индекс блока, после которого встают фото «после абзаца anchor» (−1 — перед текстом). */
export function blockOfParagraph(blocks: AnswerBlock[], anchor: number) {
  if (anchor < 0) return -1;
  const i = blocks.findIndex((b) => anchor >= b.from && anchor <= b.to);
  return i < 0 ? blocks.length - 1 : i;
}

/** Фото, привязанные к абзацам, — по блокам: ключ −1 — перед текстом, i — после блока i, Infinity — в конце. */
export function rowsByBlock<R>(blocks: AnswerBlock[], byParagraph: Map<number, R[]>): Map<number, R[]> {
  const out = new Map<number, R[]>();
  for (const [anchor, rows] of byParagraph) {
    let key = anchor === Number.POSITIVE_INFINITY ? anchor : blockOfParagraph(blocks, anchor);
    if (key === blocks.length - 1) key = Number.POSITIVE_INFINITY;
    out.set(key, [...(out.get(key) ?? []), ...rows]);
  }
  return out;
}
