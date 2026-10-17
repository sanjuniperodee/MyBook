/**
 * Бот-квалификатор: разбор ответов клиента в значения полей сделки — даты и варианты списков. Без сети и БД.
 * Даты понимаются по-русски и по-казахски, слитно и с сокращениями («4Ноябрь», «21 окт», «қарашаның 15-і»),
 * относительные («завтра», «через неделю», «в субботу») — по календарю магазина, а не сервера.
 */
import { storeTimeZone, zonedParts } from "@/shared/domain/time";
import { concepts, norm } from "./botNlu";

const RU_MONTHS = ["январ", "феврал", "март", "апрел", "", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"];
const RU_MAY = new Set(["май", "мая", "маю", "мае"]);
const RU_SHORT: Record<string, number> = { янв: 1, фев: 2, февр: 2, мар: 3, апр: 4, июн: 6, июл: 7, авг: 8, сен: 9, сент: 9, окт: 10, ноя: 11, нояб: 11, дек: 12 };
const KK_MONTHS = [
  ["қаңтар", "кантар", "қантар"],
  ["ақпан", "акпан"],
  ["наурыз"],
  ["сәуір", "сауир", "сәуир"],
  ["мамыр"],
  ["маусым"],
  ["шілде", "шилде"],
  ["тамыз"],
  ["қыркүйек", "кыркуйек", "қыркуйек"],
  ["қазан", "казан"],
  ["қараша", "караша"],
  ["желтоқсан", "желтоксан"],
];

/** Номер месяца по слову: «ноября», «ноябрь», «нояб.», «қарашаның»; «мама» — не май. */
export function monthOf(word: string): number | null {
  const w = norm(word).replace(/\.$/, "");
  const ru = RU_MONTHS.findIndex((m) => m && w.startsWith(m));
  if (ru >= 0) return ru + 1;
  if (RU_MAY.has(w)) return 5;
  if (RU_SHORT[w]) return RU_SHORT[w];
  const kk = KK_MONTHS.findIndex((variants) => variants.some((v) => w.startsWith(v)));
  return kk >= 0 ? kk + 1 : null;
}

const WORD = /[\p{L}]+\.?/gu;
/** Упоминается месяц без числа («в декабре», «желтоқсанда») — дату не угадываем, но ответ сохраняем как есть. */
export const mentionsMonth = (text: string) => [...norm(text).matchAll(WORD)].some((m) => monthOf(m[0]) !== null);

const WEEKDAYS: [number, string[]][] = [
  [1, ["понедельник", "дүйсенбі", "дуйсенби"]],
  [2, ["вторник", "сейсенбі", "сейсенби"]],
  [3, ["сред(?:а|у)(?![\\p{L}])", "сәрсенбі", "сарсенби"]],
  [4, ["четверг", "бейсенбі", "бейсенби"]],
  [5, ["пятниц", "жұма", "жума"]],
  [6, ["суббот", "сенбі", "сенби"]],
  [7, ["воскресень", "жексенбі", "жексенби"]],
];
const COUNT_WORDS: Record<string, number> = { один: 1, одну: 1, одна: 1, два: 2, две: 2, пару: 2, три: 3, четыре: 4, пять: 5, бір: 1, бир: 1, екі: 2, еки: 2, үш: 3, уш: 3, төрт: 4, торт: 4, бес: 5 };

const iso = (utc: number) => new Date(utc).toISOString().slice(0, 10);
const DAY = 86_400_000;

/**
 * «15.11», «15.11.2027», «15 ноября», «4Ноябрь», «21 окт», «15 қараша», «қарашаның 15-і», «завтра», «через неделю»,
 * «в субботу», «к Новому году» → ближайшая будущая дата YYYY-MM-DD по календарю магазина. Ищет дату в любом месте текста.
 */
export function parseDateAnswer(text: string, now = new Date(), tz = storeTimeZone()): string | null {
  const t = norm(text);
  const local = zonedParts(now, tz);
  const today = Date.UTC(local.y, local.m - 1, local.d);
  const build = (day: number, month: number, year: number | null) => {
    if (!day || !month || month > 12 || day > 31) return null;
    let y = year ?? local.y;
    if (!year && Date.UTC(y, month - 1, day) < today) y += 1;
    const d = new Date(Date.UTC(y, month - 1, day));
    return d.getUTCDate() === day ? iso(d.getTime()) : null;
  };

  const num = /(?<![\d.,])(\d{1,2})[./-](\d{1,2})(?:[./-](\d{4}|\d{2}))?(?![\d]|[.,]\d)/.exec(t);
  if (num) {
    const y = num[3] ? Number(num[3].length === 2 ? `20${num[3]}` : num[3]) : null;
    const r = build(Number(num[1]), Number(num[2]), y);
    if (r) return r;
  }
  // Число, затем месяц: «15 ноября», «4ноябрь», «15-қараша», «15-го декабря 2027».
  for (const m of t.matchAll(/(?<!\d)(\d{1,2})(?:\s*-?\s*(?:го|е|ое|ого|ші|шы|нші|ншы|і|ы))?\s*[-–]?\s*([\p{L}]+\.?)(?:\s+(\d{4}))?/gu)) {
    const month = monthOf(m[2]);
    if (month) {
      const r = build(Number(m[1]), month, m[3] ? Number(m[3]) : null);
      if (r) return r;
    }
  }
  // Месяц, затем число: «қарашаның 15-і», «ноябрь 15».
  for (const m of t.matchAll(/([\p{L}]+)\s+(\d{1,2})(?:\s*-?\s*(?:і|ы|ші|шы|нші|ншы|го|е))?(?![\d.])/gu)) {
    const month = monthOf(m[1]);
    if (month) {
      const r = build(Number(m[2]), month, null);
      if (r) return r;
    }
  }
  // Относительные даты — по календарю магазина.
  if (/послезавтра|бүрсігүні|бурсигуни/u.test(t)) return iso(today + 2 * DAY);
  if (/завтра|ертең|ертен(?![\p{L}])/u.test(t)) return iso(today + DAY);
  if (/(?<![\p{L}])(?:сегодня|бүгін|бугин)(?![\p{L}])/u.test(t)) return iso(today);
  const after = /через\s+(\d{1,2}|[\p{L}]+)?\s*(дн|день|недел|месяц)|(\d{1,2}|[\p{L}]+)?\s*(күн|кун|апта|ай)(?:дан|нан|тан|ден|нен|тен)\s+(?:кейін|кейин|соң|сон)/u.exec(t);
  if (after) {
    const countWord = after[1] ?? after[3];
    const n = countWord ? (Number(countWord) || COUNT_WORDS[countWord] || 1) : 1;
    const unit = after[2] ?? after[4];
    if (unit.startsWith("недел") || unit === "апта") return iso(today + 7 * n * DAY);
    if (unit === "месяц" || unit === "ай") {
      const d = new Date(today);
      d.setUTCMonth(d.getUTCMonth() + n);
      return iso(d.getTime());
    }
    return iso(today + n * DAY);
  }
  if (/(?<![\p{L}])(?:на\s+выходны|в\s+выходны|демалыс)/u.test(t)) return iso(today + (((6 - local.weekday + 7) % 7) || 7) * DAY);
  for (const [weekday, names] of WEEKDAYS) {
    if (names.some((n) => new RegExp(`(?<![\\p{L}])${n}`, "u").test(t))) return iso(today + (((weekday - local.weekday + 7) % 7) || 7) * DAY);
  }
  if (/нов(?:ый|ому|ым|ого)\s+год|жаңа\s*жыл|жана\s*жыл/u.test(t)) return build(31, 12, null);
  return null;
}

/** Ответ — номер варианта: «2», «№2», «2)». */
const NUMBER_ANSWER = /^\s*(?:№|номер|вариант)?\s*(\d{1,2})\s*[.)]?\s*$/u;
/** «Родители» — слабая примета: «родителям на годовщину» — это годовщина, а не «юбилей родителей». */
const WEAK: Record<string, number> = { parents: 0.5 };

/**
 * Ответ на вопрос-список → вариант. Номер — только если ответ и есть номер («8 марта» — это 8 марта, а не вариант 8).
 * Затем точное совпадение, затем по смыслу (синонимы ru/kk: «др», «туған күн», «пдф», «бумажная», «не знаю»),
 * затем по словам варианта не короче 4 букв («др» не даёт «Другой повод»). strict — только по смыслу и точному совпадению
 * (для полей, о которых бот не спрашивал, — чтобы случайное слово не заполнило поле).
 */
export function matchOption(text: string, options: string[], opts: { labels?: (string | undefined)[]; strict?: boolean } = {}): string | null {
  const t = norm(text);
  if (!t || !options.length) return null;
  if (!opts.strict) {
    const n = NUMBER_ANSWER.exec(t);
    if (n) return options[Number(n[1]) - 1] ?? null;
  }
  const clean = t.replace(/[.!?,;:]+$/g, "").trim();
  const exact = options.findIndex((o, i) => norm(o) === clean || (!!opts.labels?.[i] && norm(opts.labels[i]!) === clean));
  if (exact >= 0) return options[exact];

  const found = concepts(t);
  if (found.length) {
    let best: { i: number; score: number; at: number } | null = null;
    for (let i = 0; i < options.length; i++) {
      const own = new Set(concepts(`${options[i]} ${opts.labels?.[i] ?? ""}`).map((c) => c.id));
      const hits = found.filter((c) => own.has(c.id));
      if (!hits.length) continue;
      const score = hits.reduce((s, c) => s + (WEAK[c.id] ?? 1), 0);
      const at = Math.min(...hits.map((c) => c.at));
      if (!best || score > best.score || (score === best.score && at < best.at)) best = { i, score, at };
    }
    if (best) return options[best.i];
  }
  if (opts.strict) return null;

  const contained = options.find((o) => norm(o).length >= 3 && t.includes(norm(o)));
  if (contained) return contained;
  const words = (s: string) => norm(s).match(/[\p{L}\p{N}]+/gu) ?? [];
  const answer = words(t).filter((w) => w.length >= 4);
  return (
    options.find((o) => {
      const own = words(o).filter((w) => w.length >= 4);
      return answer.some((a) => own.some((w) => w.slice(0, 5) === a.slice(0, 5)));
    }) ?? null
  );
}
